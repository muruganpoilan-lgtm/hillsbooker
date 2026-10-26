import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets/common.dart';

const _method = {'razorpay': 'Paid online', 'upi_direct': 'UPI to you'};
const _payStatus = {'created': 'Waiting', 'paid': 'Received', 'failed': 'Not received', 'refunded': 'Refunded'};

/// The host's payments: totals, their own UPI ID, UPI payments waiting to be confirmed, and every payment.
class HostPaymentsScreen extends StatefulWidget {
  const HostPaymentsScreen({super.key});

  @override
  State<HostPaymentsScreen> createState() => _HostPaymentsScreenState();
}

class _HostPaymentsScreenState extends State<HostPaymentsScreen> {
  Map<String, dynamic>? _d;
  String _error = '';
  String _busy = '';
  final _upi = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _upi.dispose();
    super.dispose();
  }

  bool get _isAdmin => session.role == 'admin';

  List<Map<String, dynamic>> get _rows => ((_d?['rows'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  Future<void> _load() async {
    final res = await Api.get('/host/payments');
    if (!mounted) return;
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    final d = Map<String, dynamic>.from(res.data as Map);
    setState(() {
      _error = '';
      _d = d;
      _upi.text = '${d['upi_id'] ?? ''}';
    });
  }

  Future<void> _saveUpi() async {
    final res = await Api.put('/me/upi', body: {'upi_id': _upi.text});
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    final saved = res.data is Map && res.data['upi_id'] != null;
    snack(context, saved ? 'Saved. Guests can now pay you by UPI.' : 'Removed. Guests will pay online only.');
    _load();
  }

  Future<void> _decide(String id, String action) async {
    if (action == 'reject') {
      final yes = await askYesNo(context, 'Payment not received?', 'The booking will be released and the guest will see it was not paid.', 'Not received');
      if (!yes || !mounted) return;
    }
    setState(() => _busy = id);
    final res = await Api.post('/host/payments/$id/$action');
    if (!mounted) return;
    setState(() => _busy = '');
    if (!res.ok) snack(context, res.error);
    _load();
  }

  String _dates(Map<String, dynamic> r) {
    final a = parseDay('${r['start_date']}');
    final b = parseDay('${r['end_date']}');
    return '${r['start_date']}' == '${r['end_date']}' ? prettyDayYear(a) : '${prettyDayYear(a)} to ${prettyDayYear(b)}';
  }

  Widget _stat(String label, Object? v) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(color: C.soft, fontSize: 12.5)),
            const SizedBox(height: 4),
            Text(money(toNum(v)), style: display(18)),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final d = _d;
    final rows = _rows;
    final waiting = rows.where((r) => r['status'] == 'held' && r['provider'] == 'upi_direct' && r['pay_status'] == 'created').toList();
    return Scaffold(
      appBar: AppBar(title: Text('Payments', style: display(20))),
      body: d == null
          ? (_error.isNotEmpty ? ErrorBox(title: "We couldn't load payments", message: _error, onRetry: _load) : const Center(child: CircularProgressIndicator(color: C.green)))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  Row(children: [
                    _stat('Advance received', d['advance_received']),
                    const SizedBox(width: 8),
                    _stat('To collect from guests', d['balance_to_collect']),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [_stat('Refunded', d['refunded']), const Spacer()]),
                  const SizedBox(height: 18),
                  Text('Hill Booker fee (${d['commission_percent']}% of each advance)', style: display(18)),
                  const SizedBox(height: 4),
                  const Text('The guest pays no extra. The fee is taken from the advance.', style: TextStyle(color: C.soft, fontSize: 13.5)),
                  const SizedBox(height: 8),
                  Row(children: [
                    _stat(_isAdmin ? 'Commission earned' : 'Fee on payments received', d['fee_total']),
                    const SizedBox(width: 8),
                    _stat(_isAdmin ? 'Hosts owe you (UPI)' : 'You owe Hill Booker (UPI)', d['fee_owed_by_hosts']),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [
                    _stat(_isAdmin ? 'You owe hosts (online, after fee)' : 'Hill Booker pays you (online, after fee)', d['payout_due_to_hosts']),
                    const Spacer(),
                  ]),
                  const SizedBox(height: 22),
                  Text('Your UPI ID', style: display(18)),
                  const SizedBox(height: 4),
                  const Text('Guests can pay their advance straight to this UPI ID. You confirm each payment after checking your bank. Leave it empty to take online payments only.',
                      style: TextStyle(color: C.soft, fontSize: 13.5)),
                  const SizedBox(height: 10),
                  TextField(controller: _upi, autocorrect: false, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'UPI ID', hintText: 'name@bank')),
                  const SizedBox(height: 10),
                  Align(alignment: Alignment.centerLeft, child: FilledButton(onPressed: _saveUpi, child: const Text('Save UPI ID'))),
                  const SizedBox(height: 24),
                  Text('Waiting for you${waiting.isEmpty ? '' : ' (${waiting.length})'}', style: display(18)),
                  const SizedBox(height: 6),
                  if (waiting.isEmpty) const Text('No UPI payments to check right now.', style: TextStyle(color: C.soft)),
                  for (final r in waiting) _waitingCard(r),
                  const SizedBox(height: 24),
                  Text('All payments', style: display(18)),
                  const SizedBox(height: 6),
                  if (rows.isEmpty) const Text('No payments yet.', style: TextStyle(color: C.soft)),
                  for (final r in rows) _paymentCard(r),
                ],
              ),
            ),
    );
  }

  Widget _waitingCard(Map<String, dynamic> r) {
    final id = '${r['payment_id']}';
    final phone = '${r['guest_phone'] ?? ''}';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${r['guest']}${phone.isEmpty ? '' : ' · $phone'}', style: display(17)),
        const SizedBox(height: 2),
        Text('${r['item']} · ${_dates(r)}', style: const TextStyle(color: C.soft)),
        const SizedBox(height: 6),
        Text('Check your bank for ${money(toNum(r['paid_amount']))}, UPI reference ${r['reference']}', style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: FilledButton(onPressed: _busy == id ? null : () => _decide(id, 'confirm'), child: const Text('Received, confirm'))),
          const SizedBox(width: 10),
          OutlinedButton(
            onPressed: _busy == id ? null : () => _decide(id, 'reject'),
            style: OutlinedButton.styleFrom(foregroundColor: C.brick, side: const BorderSide(color: C.brick, width: 1.8)),
            child: const Text('Not received'),
          ),
        ]),
      ]),
    );
  }

  Widget _paymentCard(Map<String, dynamic> r) {
    final status = '${r['status']}';
    final provider = r['provider'];
    final payStatus = r['pay_status'];
    final total = toNum(r['total_amount']);
    final advance = toNum(r['advance_amount']);
    final method = provider == null ? 'Confirmed without online payment' : (_method['$provider'] ?? '$provider');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${r['guest']}', style: display(17)),
            const SizedBox(height: 2),
            Text('${r['item']} · ${_dates(r)}', style: const TextStyle(color: C.soft)),
            const SizedBox(height: 2),
            Text('$method${payStatus == null ? '' : ' · ${_payStatus['$payStatus'] ?? payStatus}'}', style: const TextStyle(color: C.soft)),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Price(total, size: 17),
          Text('Advance ${money(advance)}', style: const TextStyle(color: C.soft, fontSize: 12.5)),
          if (status == 'confirmed' && total > advance) Text('Collect ${money(total - advance)}', style: const TextStyle(color: C.soft, fontSize: 12.5)),
          if (payStatus == 'paid' && toNum(r['commission']) > 0) Text('Fee ${money(toNum(r['commission']))}', style: const TextStyle(color: C.soft, fontSize: 12.5)),
          Text(status == 'held' ? 'Waiting' : (status == 'confirmed' ? 'Confirmed' : 'Cancelled'),
              style: TextStyle(color: status == 'confirmed' ? C.green : C.soft, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ]),
      ]),
    );
  }
}
