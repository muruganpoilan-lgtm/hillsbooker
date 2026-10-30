import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../api.dart';
import '../format.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/upi_pay.dart';
import 'login_screen.dart';
import 'vehicle_common.dart';

// A guest's vehicle bookings: pay the advance, see the operator's number, cancel.
class VehicleBookingsScreen extends StatefulWidget {
  const VehicleBookingsScreen({super.key});

  @override
  State<VehicleBookingsScreen> createState() => _VehicleBookingsScreenState();
}

class _VehicleBookingsScreenState extends State<VehicleBookingsScreen> with WidgetsBindingObserver {
  List<Map<String, dynamic>>? _rows;
  String _error = '';
  String _busy = '';
  String _notice = '';
  bool _payOn = false;
  bool _reloadedAfterExpiry = false;
  Timer? _timer;
  late final Razorpay _rzp;

  @override
  void initState() {
    super.initState();
    session.addListener(_onSession);
    WidgetsBinding.instance.addObserver(this);
    _rzp = Razorpay();
    _rzp.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onPaid);
    _rzp.on(Razorpay.EVENT_PAYMENT_ERROR, _onPayError);
    _rzp.on(Razorpay.EVENT_EXTERNAL_WALLET, _onWallet);
    _loadConfig();
    if (session.token != null) _load();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final held = (_rows ?? []).where((b) => b['status'] == 'held').toList();
      var anyExpired = false;
      for (final b in held) {
        final until = _until(b);
        if (until != null && !until.isAfter(DateTime.now())) anyExpired = true;
      }
      if (anyExpired && !_reloadedAfterExpiry) {
        _reloadedAfterExpiry = true;
        _load();
      }
      if (held.isNotEmpty) setState(() {});
    });
  }

  // Back from Cashfree's payment page in the browser: look again, the server has usually confirmed it by now.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && session.token != null) _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _rzp.clear();
    session.removeListener(_onSession);
    super.dispose();
  }

  void _onSession() {
    if (!mounted) return;
    if (session.token != null) {
      _load();
    } else {
      setState(() => _rows = null);
    }
  }

  DateTime? _until(Map<String, dynamic> b) {
    final v = b['hold_expires_at'];
    if (v == null) return null;
    return DateTime.tryParse(v.toString());
  }

  Future<void> _loadConfig() async {
    final res = await Api.get('/payments/config');
    if (!mounted) return;
    if (res.ok && res.data is Map) setState(() => _payOn = res.data['enabled'] == true);
  }

  Future<void> _load() async {
    final res = await Api.get('/vehicle-bookings/mine');
    if (!mounted) return;
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    _reloadedAfterExpiry = false;
    setState(() {
      _error = '';
      _rows = (res.data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    });
  }

  Future<void> _pay(Map<String, dynamic> b) async {
    final id = b['id'].toString();
    setState(() {
      _busy = id;
      _notice = '';
    });
    final res = await Api.post('/payments/vehicle-bookings/$id/order');
    if (!mounted) return;
    if (!res.ok) {
      setState(() => _busy = '');
      snack(context, res.error);
      _load();
      return;
    }
    final d = res.data as Map;
    if (d['gateway'] == 'cashfree') {
      // Cashfree's payment page opens in the phone's browser. The server confirms the payment itself,
      // and this list refreshes when you come back to the app.
      final opened = await launchUrl(Uri.parse('${d['checkout_url']}'), mode: LaunchMode.externalApplication);
      if (!mounted) return;
      setState(() => _busy = '');
      if (!opened) snack(context, "Couldn't open the payment page. Try again.");
      return;
    }
    try {
      _rzp.open({
        'key': d['key_id'],
        'order_id': d['order_id'],
        'amount': d['amount'],
        'currency': d['currency'],
        'name': 'Hill Booker',
        'description': '${b['vehicle']}',
        'prefill': d['prefill'] is Map ? d['prefill'] : {},
        'theme': {'color': '#0E6B58'},
      });
    } catch (_) {
      setState(() => _busy = '');
      snack(context, "Couldn't open the payment sheet. Try again.");
    }
  }

  Future<void> _onPaid(PaymentSuccessResponse r) async {
    final res = await Api.post('/payments/verify', body: {
      'razorpay_order_id': r.orderId,
      'razorpay_payment_id': r.paymentId,
      'razorpay_signature': r.signature,
    });
    if (!mounted) return;
    setState(() {
      _busy = '';
      if (!res.ok) {
        _error = res.error;
      } else if (res.data['status'] == 'refunded') {
        _notice = 'Your payment arrived after the vehicle was released and it was gone. Your money is being refunded in full.';
      } else {
        _notice = 'Payment received. Your vehicle is booked.';
      }
    });
    _load();
  }

  void _onPayError(PaymentFailureResponse r) {
    if (!mounted) return;
    setState(() => _busy = '');
    snack(context, (r.message ?? '').isEmpty ? 'The payment did not go through.' : r.message!);
  }

  void _onWallet(ExternalWalletResponse r) {
    if (mounted) setState(() => _busy = '');
  }

  Future<void> _act(String id, String action) async {
    setState(() => _busy = id);
    final res = await Api.post('/vehicle-bookings/$id/$action');
    if (!mounted) return;
    setState(() => _busy = '');
    if (!res.ok) {
      snack(context, res.error);
    } else if (action == 'cancel' && res.data is Map && res.data['refund'] is Map) {
      final r = res.data['refund'] as Map;
      var text = '';
      if (r['status'] == 'refunded') {
        text = 'Cancelled. ${money(toNum(r['amount']))} is being refunded to your original payment method. It usually takes 5 to 7 working days.';
      } else if (r['status'] == 'manual') {
        text = 'Cancelled. You paid the host directly, so the host will return ${money(toNum(r['amount']))} to you. Contact them if you do not receive it.';
      } else if (r['status'] == 'pending') {
        text = "Cancelled. Your refund couldn't be sent automatically. We'll process it by hand and email you.";
      } else if (r['reason'] == 'too_late') {
        text = 'Cancelled. This was inside the no-refund window, so no money is returned.';
      }
      setState(() => _notice = text);
    }
    _load();
  }

  Future<void> _confirmCancel(String id) async {
    final yes = await askYesNo(context, 'Cancel this booking?', 'Cancel at least 2 days before the trip for a full refund of your advance.', 'Cancel booking');
    if (yes) _act(id, 'cancel');
  }

  @override
  Widget build(BuildContext context) {
    if (session.token == null) {
      return ListView(padding: const EdgeInsets.all(20), children: [
        Text('Vehicle bookings', style: display(26)),
        const SizedBox(height: 14),
        const Text('Log in to see your vehicle bookings.', style: TextStyle(color: C.soft, fontSize: 15)),
        const SizedBox(height: 16),
        FilledButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())), child: const Text('Log in')),
      ]);
    }
    final rows = _rows;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          if (_notice.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(color: Colors.white, border: Border(left: BorderSide(color: C.gold, width: 4))),
              child: Text(_notice),
            ),
          if (_error.isNotEmpty) ErrorBox(title: "We couldn't load your vehicle bookings", message: _error, onRetry: _load),
          if (rows == null && _error.isEmpty) const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator(color: C.green))),
          if (rows != null && rows.isEmpty)
            const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Text('No vehicle bookings yet. Find a car, van or bus from the Search tab.', style: TextStyle(color: C.soft, fontSize: 15))),
          if (rows != null) for (final b in rows) _card(b),
        ],
      ),
    );
  }

  Widget _card(Map<String, dynamic> b) {
    final id = b['id'].toString();
    final status = b['status'].toString();
    final start = parseDay(b['start_date'].toString());
    final end = parseDay(b['end_date'].toString());
    final count = toNum(b['count']).toInt();
    final balance = toNum(b['balance_due']);
    final until = _until(b);
    var left = Duration.zero;
    if (status == 'held' && until != null) {
      left = until.difference(DateTime.now());
      if (left.isNegative) left = Duration.zero;
    }
    final dates = start == end ? prettyDayYear(start) : '${prettyDayYear(start)} to ${prettyDayYear(end)}';
    final trip = b['trip'];

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Pill(vehicleStatusLabel[status] ?? status, vehicleStatusColor(status)),
        const SizedBox(height: 8),
        Text('${b['vehicle']}${count > 1 ? ' × $count' : ''}', style: display(19)),
        const SizedBox(height: 2),
        Text('${trip ?? 'Hire by the day'} · ${plural(toNum(b['passengers']).toInt(), 'passenger')} · ${b['city']}', style: const TextStyle(color: C.soft)),
        const SizedBox(height: 8),
        Row(children: [Expanded(child: Text(dates)), Price(toNum(b['total_amount']), size: 18)]),
        if ('${b['pickup'] ?? ''}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Pickup: ${b['pickup']}', style: const TextStyle(color: C.soft))),
        if (balance > 0 && (status == 'held' || status == 'confirmed')) ...[
          const SizedBox(height: 6),
          Text(
            'Advance ${money(toNum(b['advance_amount']))} is paid online. Balance ${money(balance)} is paid to the operator.',
            style: const TextStyle(color: C.green, fontWeight: FontWeight.w700, fontSize: 13.5),
          ),
        ],
        if (status == 'confirmed' && b['operator'] != null) ...[
          const SizedBox(height: 6),
          Text('Operator: ${b['operator']}${'${b['operator_phone'] ?? ''}'.isNotEmpty ? ' · ${b['operator_phone']}' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
        if (status == 'held' && until != null) ...[
          const SizedBox(height: 10),
          Text(left == Duration.zero ? 'Hold ended' : 'Vehicle held for ${holdLeft(left)}', style: const TextStyle(color: C.goldText, fontWeight: FontWeight.w800, fontSize: 16)),
          if (!_payOn) const Padding(padding: EdgeInsets.only(top: 4), child: Text("Payments aren't switched on yet. The button below confirms the booking for testing only.", style: TextStyle(color: C.soft, fontSize: 13))),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: FilledButton(
                onPressed: _busy == id || left == Duration.zero || b['upi_pending'] == true ? null : (_payOn ? () => _pay(b) : () => _act(id, 'confirm')),
                child: Text(_busy == id ? 'Opening payment…' : (_payOn ? 'Pay ${money(toNum(b['advance_amount']))}${balance > 0 ? ' now' : ''}' : 'Confirm booking (test)')),
              ),
            ),
            const SizedBox(width: 10),
            OutlinedButton(
              onPressed: _busy == id ? null : () => _act(id, 'cancel'),
              style: OutlinedButton.styleFrom(foregroundColor: C.brick, side: const BorderSide(color: C.brick, width: 1.8)),
              child: const Text('Release'),
            ),
          ]),
          if (b['upi_pending'] == true)
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: Text('You sent a UPI payment. The host will check it and confirm your booking. You will see it here once confirmed.', style: TextStyle(color: C.green, fontWeight: FontWeight.w700)),
            )
          else if (b['host_upi'] == true)
            UpiPay(kind: 'vehicle', bookingId: id, amount: toNum(b['advance_amount']), onDone: _load),
        ],
        if (status == 'confirmed') ...[
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: _busy == id ? null : () => _confirmCancel(id),
            style: OutlinedButton.styleFrom(foregroundColor: C.brick, side: const BorderSide(color: C.brick, width: 1.8)),
            child: const Text('Cancel booking'),
          ),
          const SizedBox(height: 6),
          const Text('Cancel at least 2 days before the trip and your advance is refunded in full. After that there is no refund.', style: TextStyle(color: C.soft, fontSize: 13)),
        ],
      ]),
    );
  }
}
