import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'hotel_common.dart';

// One guest's bill: the room, every extra posted to it, what has been paid and
// what is left to collect. "Copy" puts the whole bill on the clipboard so it can
// be sent on WhatsApp.

void openBill(BuildContext context, {required String kind, required String id}) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => BillScreen(kind: kind, id: id)));
}

class BillScreen extends StatefulWidget {
  /// 'walkin' for the hotel's own guest, 'hillbooker' for a booking.
  final String kind;
  final String id;

  const BillScreen({super.key, required this.kind, required this.id});

  @override
  State<BillScreen> createState() => _BillScreenState();
}

class _BillScreenState extends State<BillScreen> {
  Map<String, dynamic>? _bill;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final path = widget.kind == 'walkin' ? '/hotel/guests/${widget.id}/bill' : '/hotel/bookings/${widget.id}/bill';
    final res = await Api.get(path);
    if (!mounted) return;
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    setState(() {
      _error = '';
      _bill = rowMap(res.data);
    });
  }

  void _copy() {
    final b = _bill;
    if (b == null) return;
    final lines = <String>[
      text(b['hotel']),
      if (text(b['city']).isNotEmpty) text(b['city']),
      '',
      'Guest: ${text(b['name'])}',
      if (text(b['phone']).isNotEmpty) 'Phone: ${text(b['phone'])}',
      '${dayYearText(b['check_in'])} to ${dayYearText(b['check_out'])} · ${plural(toNum(b['nights']).toInt(), 'night')}',
      if (text(b['room']).isNotEmpty) 'Room: ${text(b['room'])}',
      '',
      'Room charge: ${money(toNum(b['room_total']))}',
    ];
    for (final c in rowList(b['charges'])) {
      lines.add('${text(c['name'])} x${toNum(c['qty']).toInt()}: ${money(toNum(c['amount']))}');
    }
    lines.addAll([
      '',
      'Total: ${money(toNum(b['total']))}',
      'Paid: ${money(toNum(b['paid']))}',
      'Balance: ${money(toNum(b['balance']))}',
    ]);
    Clipboard.setData(ClipboardData(text: lines.join('\n')));
    snack(context, 'The bill is copied. Paste it into WhatsApp or a message.');
  }

  @override
  Widget build(BuildContext context) {
    final b = _bill;
    return Scaffold(
      appBar: AppBar(
        title: Text('Bill', style: display(20)),
        actions: [
          if (b != null) IconButton(tooltip: 'Copy the bill', icon: const Icon(Icons.copy_outlined), onPressed: _copy),
        ],
      ),
      body: _error.isNotEmpty
          ? ErrorBox(title: "We couldn't load this bill", message: _error, onRetry: _load)
          : b == null
              ? const Center(child: CircularProgressIndicator(color: C.green))
              : _body(b),
    );
  }

  Widget _body(Map<String, dynamic> b) {
    final charges = rowList(b['charges']);
    final nights = toNum(b['nights']).toInt();
    final balance = toNum(b['balance']);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
      children: [
        HCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(text(b['hotel']), style: display(20)),
            if (text(b['hotel_address']).isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(text(b['hotel_address']), style: const TextStyle(color: C.soft, fontSize: 13)),
              ),
            if (text(b['invoice_no']).isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Invoice ${text(b['invoice_no'])}', style: const TextStyle(color: C.soft, fontSize: 13)),
              ),
          ]),
        ),
        HCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(text(b['name']), style: display(18)),
            if (text(b['phone']).isNotEmpty)
              Text(text(b['phone']), style: const TextStyle(color: C.soft)),
            if (text(b['address']).isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(text(b['address']), style: const TextStyle(color: C.soft, fontSize: 13)),
              ),
            const SizedBox(height: 8),
            HLine('Stay', '${dayText(b['check_in'])} to ${dayText(b['check_out'])}'),
            HLine('Nights', '$nights'),
            if (text(b['room']).isNotEmpty)
              HLine('Room', text(b['room_type']).isEmpty ? text(b['room']) : '${b['room']} · ${b['room_type']}'),
            HLine('People', qtyText(b['people'])),
            HLine('Booked', widget.kind == 'walkin' ? 'Direct with the hotel' : 'Through Hill Booker'),
          ]),
        ),
        const HHeading('Charges'),
        HCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            HLine('Room for ${plural(nights, 'night')}', money(toNum(b['room_total']))),
            if (charges.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('No food, laundry or other extras on this bill.', style: TextStyle(color: C.soft, fontSize: 13)),
              ),
            for (final c in charges)
              HLine(
                toNum(c['qty']).toInt() > 1 ? '${c['name']} × ${toNum(c['qty']).toInt()}' : text(c['name']),
                money(toNum(c['amount'])),
              ),
            const Divider(height: 20, color: C.line),
            HLine('Total', money(toNum(b['total'])), strong: true),
          ]),
        ),
        const HHeading('Payments'),
        HCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (toNum(b['paid_online']) > 0) HLine('Paid online', money(toNum(b['paid_online']))),
            HLine('Paid at the hotel', money(toNum(b['paid_here']))),
            const Divider(height: 20, color: C.line),
            HLine('Paid', money(toNum(b['paid'])), strong: true),
            HLine(
              balance > 0 ? 'Still to collect' : 'Nothing left to collect',
              money(balance),
              strong: true,
              color: balance > 0 ? C.brick : C.green,
            ),
          ]),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _copy,
          icon: const Icon(Icons.copy_outlined, size: 18),
          label: const Text('Copy the bill'),
        ),
      ],
    );
  }
}
