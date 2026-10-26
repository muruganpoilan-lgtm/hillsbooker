import 'package:flutter/material.dart';

import '../api.dart';
import '../config.dart';
import '../format.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'login_screen.dart';
import 'vehicle_common.dart';

// One vehicle: photos, details, and the form to hire it by the day or book a fixed-price trip.
class VehicleDetailScreen extends StatefulWidget {
  final String vehicleId;
  final DateTime? start;
  final DateTime? end;
  const VehicleDetailScreen({super.key, required this.vehicleId, this.start, this.end});

  @override
  State<VehicleDetailScreen> createState() => _VehicleDetailScreenState();
}

class _VehicleDetailScreenState extends State<VehicleDetailScreen> {
  Map<String, dynamic>? _v;
  String _error = '';
  String _tripId = ''; // empty means hire by the day
  late DateTime _start;
  late DateTime _end;
  int _count = 1;
  int _passengers = 2;
  final _pickup = TextEditingController();
  final _note = TextEditingController();
  bool _busy = false;
  String _bookError = '';

  @override
  void initState() {
    super.initState();
    _start = widget.start ?? today().add(const Duration(days: 1));
    _end = widget.end ?? _start;
    _load();
  }

  @override
  void dispose() {
    _pickup.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final res = await Api.get('/vehicles/${widget.vehicleId}');
    if (!mounted) return;
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    setState(() {
      _error = '';
      _v = Map<String, dynamic>.from(res.data as Map);
    });
  }

  List<Map<String, dynamic>> get _trips {
    final t = _v?['trips'];
    if (t is! List) return [];
    return t.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  int get _days => nightsBetween(_start, _end) + 1;

  num get _total {
    final v = _v;
    if (v == null) return 0;
    if (_tripId.isNotEmpty) {
      for (final t in _trips) {
        if ('${t['id']}' == _tripId) return toNum(t['price']) * _count;
      }
    }
    return toNum(v['price_per_day']) * _days * _count;
  }

  int get _percent => _v == null ? 100 : toNum(_v!['advance_percent']).toInt();

  Future<void> _pickStart() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _start,
      firstDate: today(),
      lastDate: today().add(const Duration(days: 365)),
      helpText: _tripId.isEmpty ? 'First day' : 'Trip date',
    );
    if (picked == null) return;
    setState(() {
      _start = picked;
      if (_end.isBefore(picked)) _end = picked;
    });
  }

  Future<void> _pickEnd() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _end,
      firstDate: _start,
      lastDate: today().add(const Duration(days: 400)),
      helpText: 'Last day',
    );
    if (picked != null) setState(() => _end = picked);
  }

  Future<void> _reserve() async {
    final v = _v;
    if (v == null) return;
    if (session.token == null) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
      return;
    }
    setState(() {
      _busy = true;
      _bookError = '';
    });
    final pickup = _pickup.text.trim();
    final note = _note.text.trim();
    final res = await Api.post('/vehicle-bookings', body: {
      'vehicle_id': widget.vehicleId,
      'trip_id': _tripId.isEmpty ? null : _tripId,
      'start_date': isoDate(_start),
      'end_date': isoDate(_tripId.isEmpty ? _end : _start),
      'count': _count,
      'passengers': _passengers,
      'pickup': pickup.isEmpty ? null : pickup,
      'note': note.isEmpty ? null : note,
    });
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _busy = false;
        _bookError = res.error;
      });
      return;
    }
    setState(() => _busy = false);
    snack(context, 'Held for you. Pay within 10 minutes to confirm.');
    showVehicleBookings.value = true;
    tabIndex.value = 1;
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final v = _v;
    return Scaffold(
      appBar: AppBar(title: Text(v == null ? 'Vehicle' : '${v['name']}', style: display(20))),
      body: v == null
          ? (_error.isNotEmpty
              ? ErrorBox(title: "We couldn't load this vehicle", message: _error, onRetry: _load)
              : const Center(child: CircularProgressIndicator(color: C.green)))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
              children: [
                _gallery(v),
                const SizedBox(height: 12),
                Text(vehicleLine(v), style: const TextStyle(color: C.soft, fontSize: 15)),
                const SizedBox(height: 4),
                Text('Run by ${v['operator']}', style: const TextStyle(color: C.soft, fontSize: 13)),
                if ('${v['description'] ?? ''}'.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text('${v['description']}'),
                ],
                const SizedBox(height: 10),
                _kmLine(v),
                const SizedBox(height: 18),
                _bookingPanel(v),
              ],
            ),
    );
  }

  Widget _kmLine(Map<String, dynamic> v) {
    final km = v['km_per_day'];
    final extra = v['extra_km_rate'];
    var text = km == null ? 'Unlimited kilometres.' : '${km} km included per day.';
    if (km != null && extra != null) text += ' Extra kilometres ${money(toNum(extra))} each.';
    text += ' Driver included. Fuel and tolls as agreed with the operator.';
    return Text(text, style: const TextStyle(color: C.soft, fontSize: 13.5));
  }

  Widget _gallery(Map<String, dynamic> v) {
    final photos = (v['photos'] as List?) ?? [];
    if (photos.isEmpty) {
      return SizedBox(height: 190, child: ClipRRect(borderRadius: BorderRadius.circular(8), child: PhotoOrRidge(url: null, seed: widget.vehicleId)));
    }
    return SizedBox(
      height: 190,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: photos.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) => ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            fixUrl('${(photos[i] as Map)['url']}'),
            width: 280,
            height: 190,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(width: 280, height: 190, color: C.line, child: const Icon(Icons.broken_image_outlined)),
          ),
        ),
      ),
    );
  }

  Widget _bookingPanel(Map<String, dynamic> v) {
    final trips = _trips;
    final seats = toNum(v['seats']).toInt();
    final maxCount = toNum(v["quantity"]).toInt().clamp(1, 20).toInt();
    final total = _total;
    final advance = advanceFor(total, _percent);
    final byDay = _tripId.isEmpty;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: C.ink, width: 2),
        boxShadow: const [BoxShadow(color: C.gold, offset: Offset(5, 5))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Book this vehicle', style: display(20)),
        const SizedBox(height: 10),
        RadioListTileLike(
          selected: byDay,
          title: 'Hire by the day',
          price: '${money(toNum(v['price_per_day']))} per day',
          onTap: () => setState(() => _tripId = ''),
        ),
        for (final t in trips)
          RadioListTileLike(
            selected: _tripId == '${t['id']}',
            title: '${t['title']}',
            subtitle: [
              if ('${t['from_place'] ?? ''}'.isNotEmpty || '${t['to_place'] ?? ''}'.isNotEmpty) '${t['from_place'] ?? ''} to ${t['to_place'] ?? ''}',
              if ('${t['details'] ?? ''}'.isNotEmpty) '${t['details']}',
            ].join(' · '),
            price: '${money(toNum(t['price']))} fixed',
            onTap: () => setState(() => _tripId = '${t['id']}'),
          ),
        const SizedBox(height: 10),
        if (byDay)
          Row(children: [
            Expanded(child: _dateTile('First day', _start, _pickStart)),
            const SizedBox(width: 10),
            Expanded(child: _dateTile('Last day', _end, _pickEnd)),
          ])
        else
          _dateTile('Trip date', _start, _pickStart),
        const SizedBox(height: 10),
        _stepper('Vehicles', _count, 1, maxCount, (n) => setState(() => _count = n)),
        _stepper('Passengers (seats $seats each)', _passengers, 1, 200, (n) => setState(() => _passengers = n)),
        const SizedBox(height: 6),
        TextField(controller: _pickup, decoration: fieldDeco('Pickup place', hint: 'Hotel, bus stand, address')),
        const SizedBox(height: 10),
        TextField(controller: _note, maxLines: 2, decoration: fieldDeco('Note for the operator (optional)')),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: Text(byDay ? '${plural(_days, 'day')} × ${plural(_count, 'vehicle')}' : plural(_count, 'vehicle'), style: const TextStyle(color: C.soft))),
          Price(total, size: 22),
        ]),
        if (advance < total) ...[
          const SizedBox(height: 6),
          Text(
            'Pay ${money(advance)} now. The other ${money(total - advance)} goes to the operator on the trip.',
            style: const TextStyle(color: C.green, fontWeight: FontWeight.w700, fontSize: 13.5),
          ),
        ],
        if (_bookError.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_bookError, style: const TextStyle(color: C.brick, fontWeight: FontWeight.w600))),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy ? null : _reserve, child: Text(_busy ? 'Holding…' : (session.token == null ? 'Log in to book' : 'Reserve for 10 minutes'))),
        const SizedBox(height: 8),
        const Text('Cancel at least 2 days before the trip and your advance is refunded in full. After that there is no refund.', style: TextStyle(color: C.soft, fontSize: 13)),
      ]),
    );
  }

  Widget _stepper(String label, int value, int min, int max, void Function(int) onChanged) {
    return Row(children: [
      Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, color: C.soft))),
      IconButton(onPressed: value > min ? () => onChanged(value - 1) : null, icon: const Icon(Icons.remove_circle_outline)),
      SizedBox(width: 30, child: Text('$value', textAlign: TextAlign.center, style: display(18))),
      IconButton(onPressed: value < max ? () => onChanged(value + 1) : null, icon: const Icon(Icons.add_circle_outline)),
    ]);
  }

  Widget _dateTile(String label, DateTime value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(border: Border.all(color: const Color(0xFFAAB5AC)), borderRadius: BorderRadius.circular(6)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: C.soft)),
          const SizedBox(height: 2),
          Text(prettyDayYear(value), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}

// A tappable option row with a filled or empty circle (avoids the Radio widgets that changed between Flutter versions).
class RadioListTileLike extends StatelessWidget {
  final bool selected;
  final String title;
  final String subtitle;
  final String price;
  final VoidCallback onTap;
  const RadioListTileLike({super.key, required this.selected, required this.title, this.subtitle = '', required this.price, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? const Color(0x1A0E6B58) : Colors.white,
          border: Border.all(color: selected ? C.green : C.line, width: selected ? 2 : 1),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(children: [
          Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: selected ? C.green : C.soft),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (subtitle.isNotEmpty) Text(subtitle, style: const TextStyle(color: C.soft, fontSize: 13)),
            ]),
          ),
          const SizedBox(width: 8),
          Text(price, style: const TextStyle(fontWeight: FontWeight.w800)),
        ]),
      ),
    );
  }
}
