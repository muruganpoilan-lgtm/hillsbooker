import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import 'common.dart';

/// Lets a guest pay the advance straight to the host's UPI ID, then send the 12-digit UPI reference.
/// [kind] is 'stay' or 'vehicle'. [onDone] reloads the booking list.
/// Direct-to-host UPI is switched off: guests pay through Razorpay (which already offers UPI). Set true to bring it back.
const bool kDirectUpi = false;

class UpiPay extends StatefulWidget {
  const UpiPay({super.key, required this.kind, required this.bookingId, required this.amount, required this.onDone});

  final String kind;
  final String bookingId;
  final num amount;
  final VoidCallback onDone;

  @override
  State<UpiPay> createState() => _UpiPayState();
}

class _UpiPayState extends State<UpiPay> {
  Map<String, dynamic>? _info;
  bool _open = false;
  bool _busy = false;
  String _error = '';
  final _utr = TextEditingController();

  @override
  void dispose() {
    _utr.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_open) {
      setState(() => _open = false);
      return;
    }
    setState(() => _error = '');
    final res = await Api.get('/payments/upi/${widget.kind}/${widget.bookingId}');
    if (!mounted) return;
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    setState(() {
      _info = Map<String, dynamic>.from(res.data as Map);
      _open = true;
    });
  }

  Future<void> _openApp() async {
    final link = '${_info!['link']}';
    var ok = false;
    try {
      ok = await launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!ok && mounted) snack(context, "No UPI app found. Copy the UPI ID and pay from your payment app.");
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    final res = await Api.post('/payments/upi/${widget.kind}/${widget.bookingId}/submit', body: {'utr': _utr.text});
    if (!mounted) return;
    setState(() => _busy = false);
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    setState(() => _open = false);
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    if (!kDirectUpi) return const SizedBox.shrink();
    final info = _info;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: _toggle,
        icon: const Icon(Icons.account_balance_wallet_outlined, size: 18),
        label: Text(_open ? 'Hide UPI details' : 'Pay ${money(widget.amount)} by UPI'),
      ),
      if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_error, style: const TextStyle(color: C.brick, fontWeight: FontWeight.w700))),
      if (_open && info != null)
        Container(
          margin: const EdgeInsets.only(top: 10),
          padding: const EdgeInsets.all(14),
          decoration: const BoxDecoration(color: Colors.white, border: Border(left: BorderSide(color: C.gold, width: 4))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Pay ${money(toNum(info['amount']))} to ${info['payee']} from any UPI app.', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: SelectableText('${info['upi_id']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
              TextButton(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: '${info['upi_id']}'));
                  if (mounted) snack(context, 'UPI ID copied');
                },
                child: const Text('Copy'),
              ),
            ]),
            const SizedBox(height: 4),
            FilledButton.icon(onPressed: _openApp, icon: const Icon(Icons.open_in_new, size: 18), label: const Text('Open my UPI app')),
            const SizedBox(height: 10),
            Text(
              'After paying, enter the 12-digit UPI reference from your payment app. The host checks it and confirms your booking within ${info['confirm_hours']} hours. Your booking stays held until then.',
              style: const TextStyle(color: C.soft, fontSize: 13.5),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _utr,
              keyboardType: TextInputType.number,
              maxLength: 14,
              decoration: const InputDecoration(labelText: 'UPI reference (12 digits)', counterText: ''),
            ),
            const SizedBox(height: 10),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Sending…' : 'I have paid')),
          ]),
        ),
    ]);
  }
}
