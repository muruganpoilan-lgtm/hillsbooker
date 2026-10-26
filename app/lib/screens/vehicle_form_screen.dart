import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'vehicle_common.dart';

// Add a vehicle, or edit one when `initial` (the vehicle as returned by /operator/vehicles/ID) is given.
// Pops with the vehicle's id once saved.
class VehicleFormScreen extends StatefulWidget {
  final Map<String, dynamic>? initial;
  const VehicleFormScreen({super.key, this.initial});

  @override
  State<VehicleFormScreen> createState() => _VehicleFormScreenState();
}

class _VehicleFormScreenState extends State<VehicleFormScreen> {
  late final TextEditingController _name;
  late final TextEditingController _city;
  late final TextEditingController _description;
  late final TextEditingController _seats;
  late final TextEditingController _price;
  late final TextEditingController _km;
  late final TextEditingController _extra;
  late final TextEditingController _quantity;
  String _kind = 'car';
  bool _ac = true;
  int _advance = 30;
  bool _busy = false;
  String _error = '';

  bool get _editing => widget.initial != null;

  String _s(String key) {
    final v = widget.initial?[key];
    return v == null ? '' : '$v';
  }

  String _num(String key) {
    final v = widget.initial?[key];
    if (v == null) return '';
    final n = num.tryParse('$v');
    if (n == null) return '';
    return n == n.roundToDouble() ? '${n.round()}' : '$n';
  }

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: _s('name'));
    _city = TextEditingController(text: _s('city'));
    _description = TextEditingController(text: _s('description'));
    _seats = TextEditingController(text: _num('seats'));
    _price = TextEditingController(text: _num('price_per_day'));
    _km = TextEditingController(text: _num('km_per_day'));
    _extra = TextEditingController(text: _num('extra_km_rate'));
    _quantity = TextEditingController(text: _editing ? _num('quantity') : '1');
    final i = widget.initial;
    if (i != null) {
      _kind = '${i['kind'] ?? 'car'}';
      _ac = i['ac'] != false;
      _advance = (i['advance_percent'] is num) ? (i['advance_percent'] as num).toInt() : 100;
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _city, _description, _seats, _price, _km, _extra, _quantity]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final seats = int.tryParse(_seats.text.trim());
    final price = double.tryParse(_price.text.trim());
    final quantity = int.tryParse(_quantity.text.trim());
    if (_name.text.trim().isEmpty || _city.text.trim().isEmpty) {
      setState(() => _error = 'Enter a name and the city the vehicle is based in.');
      return;
    }
    if (seats == null || seats < 1 || price == null || price < 0 || quantity == null || quantity < 1) {
      setState(() => _error = 'Enter seats, price per day and how many vehicles you have.');
      return;
    }
    final km = int.tryParse(_km.text.trim());
    final extra = double.tryParse(_extra.text.trim());
    final desc = _description.text.trim();
    setState(() {
      _busy = true;
      _error = '';
    });
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'kind': _kind,
      'seats': seats,
      'ac': _ac,
      'city': _city.text.trim(),
      'description': desc.isEmpty ? null : desc,
      'price_per_day': price,
      'km_per_day': km,
      'extra_km_rate': extra,
      'quantity': quantity,
      'advance_percent': _advance,
    };
    final ApiResult res;
    if (_editing) {
      res = await Api.patch('/operator/vehicles/${widget.initial!['id']}', body: body);
    } else {
      res = await Api.post('/operator/vehicles', body: body);
    }
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _busy = false;
        _error = res.error;
      });
      return;
    }
    Navigator.of(context).pop(_editing ? '${widget.initial!['id']}' : '${res.data['id']}');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_editing ? 'Edit vehicle' : 'Add a vehicle', style: display(20))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: fieldDeco('Vehicle name', hint: 'Toyota Innova Crysta')),
          const SizedBox(height: 14),
          const Text('Type', style: TextStyle(fontWeight: FontWeight.w700, color: C.soft)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              for (final k in vehicleKinds) ChoiceChip(label: Text(k.value), selected: _kind == k.key, onSelected: (_) => setState(() => _kind = k.key)),
            ],
          ),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: TextField(controller: _seats, keyboardType: TextInputType.number, decoration: fieldDeco('Seats'))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _quantity, keyboardType: TextInputType.number, decoration: fieldDeco('How many do you have'))),
          ]),
          SwitchListTile(contentPadding: EdgeInsets.zero, value: _ac, onChanged: (v) => setState(() => _ac = v), title: const Text('Air conditioned')),
          TextField(controller: _city, textCapitalization: TextCapitalization.words, decoration: fieldDeco('Based in (city)', hint: 'Munnar')),
          const SizedBox(height: 14),
          TextField(controller: _price, keyboardType: TextInputType.number, decoration: fieldDeco('Price per day (₹)', hint: '3500')),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: TextField(controller: _km, keyboardType: TextInputType.number, decoration: fieldDeco('Km per day', hint: 'Blank = unlimited'))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _extra, keyboardType: TextInputType.number, decoration: fieldDeco('Extra km rate (₹)'))),
          ]),
          const SizedBox(height: 14),
          TextField(controller: _description, maxLines: 3, decoration: fieldDeco('About this vehicle', hint: 'Driver, luggage space, music system…')),
          const SizedBox(height: 18),
          const Text('Advance paid online', style: TextStyle(fontWeight: FontWeight.w700, color: C.soft)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              for (final n in const [10, 20, 25, 30, 50, 100])
                ChoiceChip(label: Text(n == 100 ? 'Full 100%' : '$n%'), selected: _advance == n, onSelected: (_) => setState(() => _advance = n)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            _advance == 100 ? 'Guests pay the full amount online.' : 'Guests pay $_advance% online and the rest to you on the trip.',
            style: const TextStyle(color: C.soft, fontSize: 13),
          ),
          if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error, style: const TextStyle(color: C.brick, fontWeight: FontWeight.w600))),
          const SizedBox(height: 18),
          FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : (_editing ? 'Save changes' : 'Save and add photos'))),
        ],
      ),
    );
  }
}
