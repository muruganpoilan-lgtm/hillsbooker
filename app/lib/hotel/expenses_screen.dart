import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'hotel_common.dart';

// What the hotel spends: groceries, electricity, repairs and the rest, month by
// month, with the bills still owed to suppliers kept separate.

class ExpensesSection extends StatefulWidget {
  final String propertyId;
  const ExpensesSection({super.key, required this.propertyId});

  @override
  State<ExpensesSection> createState() => _ExpensesSectionState();
}

class _ExpensesSectionState extends State<ExpensesSection> {
  String _month = monthKey(today());
  List<Map<String, dynamic>> _expenses = [];
  List<Map<String, dynamic>> _dues = [];
  Map<String, dynamic> _totals = {};
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Api.get('/hotel/${widget.propertyId}/expenses', query: {'month': _month});
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
      _expenses = rowList(d['expenses']);
      _dues = rowList(d['dues']);
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

  Future<void> _sheet({Map<String, dynamic>? expense}) async {
    final amount = TextEditingController(text: expense == null ? '' : toNum(expense['amount']).round().toString());
    final supplier = TextEditingController(text: text(expense?['supplier']));
    final note = TextEditingController(text: text(expense?['note']));
    String category = text(expense?['category']).isEmpty ? 'groceries' : text(expense!['category']);
    String? method = text(expense?['method']).isEmpty ? null : text(expense?['method']);
    DateTime spentOn = tryDay(expense?['spent_on']) ?? today();
    bool paid = expense == null ? true : expense['paid'] != false;
    String error = '';

    final saved = await hotelSheet<bool>(
      context,
      expense == null ? 'Add an expense' : 'Edit this expense',
      (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            HChoice(
              label: 'What for',
              value: category,
              options: expenseKindNames,
              onChanged: (v) => setSheet(() => category = v ?? 'other'),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: amount,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: fieldDeco('Amount ₹'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: HDateField(label: 'On', value: spentOn, onChanged: (d) => setSheet(() => spentOn = d)),
              ),
            ]),
            const SizedBox(height: 12),
            TextField(
              controller: supplier,
              textCapitalization: TextCapitalization.words,
              decoration: fieldDeco('Supplier or shop', hint: 'Optional'),
            ),
            const SizedBox(height: 12),
            HChoice(
              label: 'Paid how',
              value: method,
              options: payMethodNames,
              emptyLabel: 'Not recorded',
              onChanged: (v) => setSheet(() => method = v),
            ),
            const SizedBox(height: 4),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeColor: C.green,
              value: paid,
              title: const Text('Already paid'),
              subtitle: Text(paid ? 'Nothing owed on this' : 'Shows under money owed to suppliers'),
              onChanged: (v) => setSheet(() => paid = v),
            ),
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
                  setSheet(() => error = 'Enter how much was spent.');
                  return;
                }
                final body = <String, dynamic>{
                  'spent_on': isoDate(spentOn),
                  'category': category,
                  'amount': moneyOut(v),
                  'supplier': supplier.text.trim().isEmpty ? null : supplier.text.trim(),
                  'method': method,
                  'paid': paid,
                  'note': note.text.trim().isEmpty ? null : note.text.trim(),
                };
                final res = expense == null
                    ? await Api.post('/hotel/${widget.propertyId}/expenses', body: body)
                    : await Api.patch('/hotel/expenses/${expense['id']}', body: body);
                if (!ctx2.mounted) return;
                if (!res.ok) {
                  setSheet(() => error = res.error);
                  return;
                }
                Navigator.of(ctx2).pop(true);
              },
              child: Text(expense == null ? 'Add' : 'Save'),
            ),
            if (expense != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  final yes = await askYesNo(ctx2, 'Remove this expense?', 'It will be deleted from the month.', 'Remove');
                  if (!yes || !ctx2.mounted) return;
                  final res = await Api.delete('/hotel/expenses/${expense['id']}');
                  if (!ctx2.mounted) return;
                  if (!res.ok) {
                    setSheet(() => error = res.error);
                    return;
                  }
                  Navigator.of(ctx2).pop(true);
                },
                icon: const Icon(Icons.delete_outline, size: 18, color: C.brick),
                label: const Text('Remove', style: TextStyle(color: C.brick)),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: C.brick)),
              ),
            ],
          ]);
        },
      ),
    );

    amount.dispose();
    supplier.dispose();
    note.dispose();
    if (saved == true && mounted) await _load();
  }

  Future<void> _markPaid(Map<String, dynamic> e) async {
    final res = await Api.patch('/hotel/expenses/${e['id']}', body: {'paid': true});
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
      return ErrorBox(title: "We couldn't load your expenses", message: _error, onRetry: _load);
    }

    final byCategory = rowList(_totals['by_category']);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 36),
        children: [
          HMonthBar(month: _month, onChanged: _changeMonth),
          FilledButton.icon(
            onPressed: () => _sheet(),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add an expense'),
          ),
          const SizedBox(height: 14),
          HTotals(children: [
            HLine('Spent this month', money(toNum(_totals['spent']))),
            HLine('Of that, already paid', money(toNum(_totals['paid']))),
            HLine('Salary paid this month', money(toNum(_totals['salary_paid']))),
            HLine('Everything out the door', money(toNum(_totals['with_salary'])), strong: true),
            if (toNum(_totals['due_all']) > 0)
              HLine('Owed to suppliers', money(toNum(_totals['due_all'])), strong: true, color: C.brick),
          ]),
          if (byCategory.isNotEmpty) ...[
            const SizedBox(height: 6),
            const HHeading('Where it went'),
            HCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final c in byCategory)
                  HLine(expenseKindNames[text(c['category'])] ?? text(c['category']), money(toNum(c['amount']))),
              ]),
            ),
          ],
          if (_dues.isNotEmpty) ...[
            const SizedBox(height: 6),
            const HHeading('Still owed to suppliers'),
            for (final d in _dues) _dueCard(d),
          ],
          const SizedBox(height: 6),
          HHeading(monthTitle(_month)),
          if (_expenses.isEmpty)
            const HEmpty('Nothing recorded for this month yet.')
          else
            for (final e in _expenses) _expenseCard(e),
        ],
      ),
    );
  }

  Widget _dueCard(Map<String, dynamic> d) {
    return HCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              text(d['supplier']).isEmpty
                  ? (expenseKindNames[text(d['category'])] ?? 'Expense')
                  : text(d['supplier']),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            Text(
              '${expenseKindNames[text(d['category'])] ?? ''} · ${dayYearText(d['spent_on'])}',
              style: const TextStyle(color: C.soft, fontSize: 12.5),
            ),
          ]),
        ),
        Text(money(toNum(d['amount'])), style: const TextStyle(fontWeight: FontWeight.w800, color: C.brick)),
        const SizedBox(width: 6),
        OutlinedButton(
          onPressed: () => _markPaid(d),
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 34), padding: const EdgeInsets.symmetric(horizontal: 10)),
          child: const Text('Paid'),
        ),
      ]),
    );
  }

  Widget _expenseCard(Map<String, dynamic> e) {
    final unpaid = e['paid'] == false;
    return HCard(
      onTap: () => _sheet(expense: e),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(expenseKindNames[text(e['category'])] ?? 'Other', style: const TextStyle(fontWeight: FontWeight.w700)),
              if (unpaid) ...[
                const SizedBox(width: 8),
                const Pill('Not paid', C.brick),
              ],
            ]),
            Text(
              [
                dayText(e['spent_on']),
                if (text(e['supplier']).isNotEmpty) text(e['supplier']),
                if (text(e['method']).isNotEmpty) payMethodNames[text(e['method'])] ?? '',
              ].where((x) => x.isNotEmpty).join(' · '),
              style: const TextStyle(color: C.soft, fontSize: 12.5),
            ),
            if (text(e['note']).isNotEmpty)
              Text(text(e['note']), style: const TextStyle(color: C.soft, fontSize: 12, fontStyle: FontStyle.italic)),
          ]),
        ),
        Text(money(toNum(e['amount'])), style: const TextStyle(fontWeight: FontWeight.w800)),
        const Icon(Icons.chevron_right, color: C.soft),
      ]),
    );
  }
}
