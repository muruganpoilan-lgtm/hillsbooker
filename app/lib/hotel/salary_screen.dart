import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'hotel_common.dart';

// One month's pay: what each person is owed, the advances they took, what has
// been paid, and what is left. Attendance for the month is shown beside each name.

class SalarySection extends StatefulWidget {
  final String propertyId;
  const SalarySection({super.key, required this.propertyId});

  @override
  State<SalarySection> createState() => _SalarySectionState();
}

class _SalarySectionState extends State<SalarySection> {
  String _month = monthKey(today());
  List<Map<String, dynamic>> _staff = [];
  List<Map<String, dynamic>> _payments = [];
  Map<String, dynamic> _totals = {};
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Api.get('/hotel/${widget.propertyId}/salary', query: {'month': _month});
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _loading = false;
        _error = res.error;
      });
      return;
    }
    final d = rowMap(res.data);
    setState(() {
      _loading = false;
      _error = '';
      _staff = rowList(d['staff']);
      _payments = rowList(d['payments']);
      _totals = rowMap(d['totals']);
    });
  }

  Future<void> _changeMonth(String m) async {
    setState(() {
      _month = m;
      _loading = true;
    });
    await _load();
  }

  Future<void> _paySheet(Map<String, dynamic> person, String kind) async {
    final balance = toNum(person['balance']);
    final amount = TextEditingController(
      text: kind == 'salary' && balance > 0 ? balance.round().toString() : '',
    );
    final note = TextEditingController();
    DateTime paidOn = today();
    String error = '';

    final saved = await hotelSheet<bool>(
      context,
      kind == 'salary' ? 'Pay ${person['name']}' : 'Advance for ${person['name']}',
      (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(
              kind == 'salary'
                  ? 'Counts towards ${monthTitle(_month)}. ${money(balance)} is left for this month.'
                  : 'Money given before payday. It is taken off ${monthTitle(_month)}.',
              style: const TextStyle(color: C.soft, fontSize: 13),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: amount,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: fieldDeco('Amount ₹'),
            ),
            const SizedBox(height: 12),
            HDateField(label: 'Paid on', value: paidOn, onChanged: (d) => setSheet(() => paidOn = d)),
            const SizedBox(height: 12),
            TextField(controller: note, decoration: fieldDeco('Note', hint: 'Optional')),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error, style: const TextStyle(color: C.brick)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                final v = parseMoney(amount.text);
                if (v == null || v <= 0) {
                  setSheet(() => error = 'Enter how much was paid.');
                  return;
                }
                final res = await Api.post('/hotel/${widget.propertyId}/salary/payments', body: {
                  'staff_id': text(person['id']),
                  'month': _month,
                  'kind': kind,
                  'amount': moneyOut(v),
                  'paid_on': isoDate(paidOn),
                  'note': note.text.trim().isEmpty ? null : note.text.trim(),
                });
                if (!ctx2.mounted) return;
                if (!res.ok) {
                  setSheet(() => error = res.error);
                  return;
                }
                Navigator.of(ctx2).pop(true);
              },
              child: Text(kind == 'salary' ? 'Record this payment' : 'Record this advance'),
            ),
          ]);
        },
      ),
    );

    amount.dispose();
    note.dispose();
    if (saved == true && mounted) await _load();
  }

  Future<void> _removePayment(Map<String, dynamic> p) async {
    final yes = await askYesNo(
      context,
      'Remove this payment?',
      '${money(toNum(p['amount']))} ${p['kind'] == 'advance' ? 'advance' : 'salary'} for ${p['name']} will be deleted.',
      'Remove',
    );
    if (!yes || !mounted) return;
    final res = await Api.delete('/hotel/salary/payments/${p['id']}');
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: C.green));
    if (_error.isNotEmpty) {
      return ErrorBox(title: "We couldn't load the salary sheet", message: _error, onRetry: _load);
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 36),
        children: [
          HMonthBar(month: _month, onChanged: _changeMonth),
          HTotals(children: [
            HLine('People on the sheet', qtyText(_totals['staff'])),
            HLine('Salary for the month', money(toNum(_totals['salary']))),
            HLine('Advances taken', money(toNum(_totals['advances']))),
            HLine('Salary paid', money(toNum(_totals['paid']))),
            HLine(
              'Still to pay',
              money(toNum(_totals['balance'])),
              strong: true,
              color: toNum(_totals['balance']) > 0 ? C.brick : C.green,
            ),
          ]),
          const SizedBox(height: 6),
          if (_staff.isEmpty) const HEmpty('Nobody on the salary sheet for this month.'),
          for (final s in _staff) _personCard(s),
          if (_payments.isNotEmpty) ...[
            const SizedBox(height: 12),
            const HHeading('Everything paid this month'),
            for (final p in _payments) _paymentCard(p),
          ],
        ],
      ),
    );
  }

  Widget _personCard(Map<String, dynamic> s) {
    final balance = toNum(s['balance']);
    final present = toNum(s['present']).toInt();
    final half = toNum(s['half']).toInt();
    final leave = toNum(s['leave']).toInt();
    final absent = toNum(s['absent']).toInt();
    final days = <String>[];
    if (present > 0) days.add('$present present');
    if (half > 0) days.add('$half half');
    if (leave > 0) days.add('$leave leave');
    if (absent > 0) days.add('$absent absent');

    return HCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text(s['name']), style: display(16)),
              if (text(s['job']).isNotEmpty)
                Text(text(s['job']), style: const TextStyle(color: C.soft, fontSize: 12.5)),
              Text(
                days.isEmpty ? 'No attendance marked this month' : days.join(' · '),
                style: const TextStyle(color: C.soft, fontSize: 12.5),
              ),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(money(toNum(s['monthly_salary'])), style: const TextStyle(fontWeight: FontWeight.w800)),
            const Text('a month', style: TextStyle(color: C.soft, fontSize: 12)),
          ]),
        ]),
        const SizedBox(height: 8),
        if (toNum(s['advances']) > 0) HLine('Advances', money(toNum(s['advances']))),
        if (toNum(s['salary_paid']) > 0) HLine('Paid', money(toNum(s['salary_paid']))),
        HLine(
          balance > 0 ? 'Still to pay' : 'Settled',
          money(balance),
          strong: true,
          color: balance > 0 ? C.brick : C.green,
        ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: FilledButton(onPressed: () => _paySheet(s, 'salary'), child: const Text('Pay salary')),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton(onPressed: () => _paySheet(s, 'advance'), child: const Text('Advance')),
          ),
        ]),
      ]),
    );
  }

  Widget _paymentCard(Map<String, dynamic> p) {
    final advance = text(p['kind']) == 'advance';
    return HCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(text(p['name']), style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(
              '${advance ? 'Advance' : 'Salary'} · ${dayYearText(p['paid_on'])}${text(p['note']).isEmpty ? '' : ' · ${p['note']}'}',
              style: const TextStyle(color: C.soft, fontSize: 12.5),
            ),
          ]),
        ),
        Text(money(toNum(p['amount'])), style: TextStyle(fontWeight: FontWeight.w800, color: advance ? C.goldText : C.ink)),
        IconButton(
          tooltip: 'Remove',
          icon: const Icon(Icons.delete_outline, size: 18, color: C.soft),
          onPressed: () => _removePayment(p),
        ),
      ]),
    );
  }
}
