import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/photo_strip.dart';
import 'owner_home_screen.dart' show propertyStatusColor, propertyStatusLabel;
import 'vehicle_common.dart';
import 'vehicle_form_screen.dart';

// Everything for one vehicle: details, photos and fixed-price trips.
class VehicleManageScreen extends StatefulWidget {
  final String vehicleId;
  const VehicleManageScreen({super.key, required this.vehicleId});

  @override
  State<VehicleManageScreen> createState() => _VehicleManageScreenState();
}

class _VehicleManageScreenState extends State<VehicleManageScreen> {
  Map<String, dynamic>? _v;
  String _error = '';

  String get _base => '/operator/vehicles/${widget.vehicleId}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Api.get(_base);
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

  List<Map<String, dynamic>> _list(String key) {
    final l = _v?[key];
    if (l is! List) return [];
    return l.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _edit() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => VehicleFormScreen(initial: _v)));
    if (mounted) _load();
  }

  Future<void> _tripDialog([Map<String, dynamic>? trip]) async {
    final out = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _TripDialog(trip: trip));
    if (out == null || !mounted) return;
    final res = trip == null ? await Api.post('$_base/trips', body: out) : await Api.patch('/operator/trips/${trip['id']}', body: out);
    if (!mounted) return;
    if (!res.ok) snack(context, res.error);
    _load();
  }

  Future<void> _removeTrip(Map<String, dynamic> trip) async {
    final yes = await askYesNo(context, 'Remove this trip?', 'Guests will no longer be able to book it. Past bookings are not affected.', 'Remove');
    if (!yes || !mounted) return;
    final res = await Api.delete('/operator/trips/${trip['id']}');
    if (!mounted) return;
    if (!res.ok) snack(context, res.error);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final v = _v;
    return Scaffold(
      appBar: AppBar(title: Text(v == null ? 'Vehicle' : '${v['name']}', style: display(20))),
      body: v == null
          ? (_error.isNotEmpty ? ErrorBox(title: "We couldn't load this vehicle", message: _error, onRetry: _load) : const Center(child: CircularProgressIndicator(color: C.green)))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                children: [
                  Row(children: [
                    Pill(propertyStatusLabel('${v['status']}'), propertyStatusColor('${v['status']}')),
                    const Spacer(),
                    OutlinedButton.icon(onPressed: _edit, icon: const Icon(Icons.edit_outlined, size: 18), label: const Text('Edit details')),
                  ]),
                  if (v['status'] == 'pending')
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('Guests will see this vehicle once it is approved. You can add photos and trips meanwhile.', style: TextStyle(color: C.soft, fontSize: 13.5)),
                    ),
                  const SizedBox(height: 10),
                  Text(vehicleLine(v), style: const TextStyle(color: C.soft, fontSize: 15)),
                  const SizedBox(height: 4),
                  Text('${money(toNum(v['price_per_day']))} per day · ${plural(toNum(v['quantity']).toInt(), 'vehicle')} · advance ${v['advance_percent']}%', style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 20),
                  Text('Photos', style: display(18)),
                  const SizedBox(height: 8),
                  PhotoStrip(base: _base, photos: _list('photos'), onChanged: _load),
                  const SizedBox(height: 24),
                  Row(children: [
                    Expanded(child: Text('Fixed-price trips', style: display(18))),
                    TextButton.icon(onPressed: () => _tripDialog(), icon: const Icon(Icons.add), label: const Text('Add a trip')),
                  ]),
                  const Text('For example "Munnar sightseeing, one day". Guests can book these at the fixed price instead of hiring by the day.', style: TextStyle(color: C.soft, fontSize: 13.5)),
                  const SizedBox(height: 8),
                  for (final t in _list('trips').where((t) => t['active'] != false)) _tripCard(t),
                  if (_list('trips').where((t) => t['active'] != false).isEmpty)
                    const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No trips yet.', style: TextStyle(color: C.soft))),
                ],
              ),
            ),
    );
  }

  Widget _tripCard(Map<String, dynamic> t) {
    final route = [if ('${t['from_place'] ?? ''}'.isNotEmpty) '${t['from_place']}', if ('${t['to_place'] ?? ''}'.isNotEmpty) '${t['to_place']}'].join(' to ');
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${t['title']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
            if (route.isNotEmpty) Text(route, style: const TextStyle(color: C.soft)),
            if ('${t['details'] ?? ''}'.isNotEmpty) Text('${t['details']}', style: const TextStyle(color: C.soft, fontSize: 13)),
          ]),
        ),
        Price(toNum(t['price']), size: 17),
        IconButton(tooltip: 'Edit trip', icon: const Icon(Icons.edit_outlined), onPressed: () => _tripDialog(t)),
        IconButton(tooltip: 'Remove trip', icon: const Icon(Icons.delete_outline, color: C.brick), onPressed: () => _removeTrip(t)),
      ]),
    );
  }
}

class _TripDialog extends StatefulWidget {
  final Map<String, dynamic>? trip;
  const _TripDialog({this.trip});

  @override
  State<_TripDialog> createState() => _TripDialogState();
}

class _TripDialogState extends State<_TripDialog> {
  late final TextEditingController _title;
  late final TextEditingController _from;
  late final TextEditingController _to;
  late final TextEditingController _price;
  late final TextEditingController _details;
  String _error = '';

  String _s(String k) => widget.trip?[k] == null ? '' : '${widget.trip![k]}';

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: _s('title'));
    _from = TextEditingController(text: _s('from_place'));
    _to = TextEditingController(text: _s('to_place'));
    final p = num.tryParse(_s('price'));
    _price = TextEditingController(text: p == null ? '' : '${p.round()}');
    _details = TextEditingController(text: _s('details'));
  }

  @override
  void dispose() {
    for (final c in [_title, _from, _to, _price, _details]) {
      c.dispose();
    }
    super.dispose();
  }

  void _ok() {
    final price = double.tryParse(_price.text.trim());
    if (_title.text.trim().isEmpty || price == null || price < 0) {
      setState(() => _error = 'Enter a title and a price.');
      return;
    }
    Navigator.of(context).pop(<String, dynamic>{
      'title': _title.text.trim(),
      'from_place': _from.text.trim().isEmpty ? null : _from.text.trim(),
      'to_place': _to.text.trim().isEmpty ? null : _to.text.trim(),
      'details': _details.text.trim().isEmpty ? null : _details.text.trim(),
      'price': price,
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.trip == null ? 'Add a trip' : 'Edit trip'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _title, decoration: fieldDeco('Title', hint: 'Munnar sightseeing, one day')),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _from, decoration: fieldDeco('From'))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: _to, decoration: fieldDeco('To'))),
          ]),
          const SizedBox(height: 10),
          TextField(controller: _price, keyboardType: TextInputType.number, decoration: fieldDeco('Fixed price (₹)')),
          const SizedBox(height: 10),
          TextField(controller: _details, maxLines: 2, decoration: fieldDeco('What is included', hint: '8 hours, 5 stops')),
          if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error, style: const TextStyle(color: C.brick, fontWeight: FontWeight.w600))),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        TextButton(onPressed: _ok, child: const Text('Save')),
      ],
    );
  }
}
