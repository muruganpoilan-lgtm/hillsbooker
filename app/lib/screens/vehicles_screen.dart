import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'vehicle_common.dart';
import 'vehicle_detail_screen.dart';

// Guests browse cars, vans and buses for hire. Dates are optional; with dates, only free vehicles show.
class VehiclesScreen extends StatefulWidget {
  final String city;
  const VehiclesScreen({super.key, this.city = ''});

  @override
  State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  late final TextEditingController _city;
  String _kind = '';
  DateTime? _start;
  DateTime? _end;
  List<Map<String, dynamic>>? _rows;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _city = TextEditingController(text: widget.city);
    _load();
  }

  @override
  void dispose() {
    _city.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _rows = null);
    final q = <String, String>{};
    if (_city.text.trim().isNotEmpty) q['city'] = _city.text.trim();
    if (_kind.isNotEmpty) q['kind'] = _kind;
    final s = _start;
    if (s != null) {
      q['start'] = isoDate(s);
      q['end'] = isoDate(_end ?? s);
    }
    final res = await Api.get('/vehicles', query: q);
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _error = res.error;
        _rows = [];
      });
      return;
    }
    setState(() {
      _error = '';
      _rows = (res.data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    });
  }

  Future<void> _pickStart() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _start ?? today().add(const Duration(days: 1)),
      firstDate: today(),
      lastDate: today().add(const Duration(days: 365)),
      helpText: 'First day',
    );
    if (picked == null) return;
    setState(() {
      _start = picked;
      final e = _end;
      if (e == null || e.isBefore(picked)) _end = picked;
    });
    _load();
  }

  Future<void> _pickEnd() async {
    final s = _start ?? today().add(const Duration(days: 1));
    final picked = await showDatePicker(
      context: context,
      initialDate: _end ?? s,
      firstDate: s,
      lastDate: today().add(const Duration(days: 400)),
      helpText: 'Last day',
    );
    if (picked == null) return;
    setState(() {
      _start ??= s;
      _end = picked;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    return Scaffold(
      appBar: AppBar(title: Text('Cars, vans and buses', style: display(20))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            TextField(
              controller: _city,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _load(),
              decoration: fieldDeco('City', hint: 'Munnar, Ooty, Valparai', prefix: const Icon(Icons.place_outlined)),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _dateTile('First day', _start, _pickStart)),
              const SizedBox(width: 10),
              Expanded(child: _dateTile('Last day', _end, _pickEnd)),
            ]),
            if (_start != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () {
                    setState(() {
                      _start = null;
                      _end = null;
                    });
                    _load();
                  },
                  child: const Text('Clear dates'),
                ),
              ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(label: const Text('All'), selected: _kind.isEmpty, onSelected: (_) => _setKind('')),
                for (final k in vehicleKinds) ChoiceChip(label: Text(k.value), selected: _kind == k.key, onSelected: (_) => _setKind(k.key)),
              ],
            ),
            const SizedBox(height: 10),
            FilledButton(onPressed: _load, child: const Text('Search vehicles')),
            const SizedBox(height: 14),
            if (_error.isNotEmpty) ErrorBox(title: "We couldn't load vehicles", message: _error, onRetry: _load),
            if (rows == null) const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator(color: C.green))),
            if (rows != null && rows.isEmpty && _error.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text('No vehicles found. Try another city or other dates.', style: TextStyle(color: C.soft, fontSize: 15)),
              ),
            if (rows != null) for (final v in rows) _card(v),
          ],
        ),
      ),
    );
  }

  void _setKind(String k) {
    setState(() => _kind = k);
    _load();
  }

  Widget _dateTile(String label, DateTime? value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: const Color(0xFFAAB5AC)), borderRadius: BorderRadius.circular(6)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: C.soft)),
          const SizedBox(height: 2),
          Text(value == null ? 'Any date' : prettyDayYear(value), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }

  Widget _card(Map<String, dynamic> v) {
    final tripFrom = v['trip_from'];
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => VehicleDetailScreen(vehicleId: '${v['id']}', start: _start, end: _end))),
          child: Container(
            decoration: BoxDecoration(border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
            clipBehavior: Clip.antiAlias,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(height: 150, width: double.infinity, child: PhotoOrRidge(url: v['photo'] as String?, seed: '${v['id']}')),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${v['name']}', style: display(18)),
                      const SizedBox(height: 2),
                      Text(vehicleLine(v), style: const TextStyle(color: C.soft)),
                      if (tripFrom != null) ...[
                        const SizedBox(height: 4),
                        Text('Fixed trips from ${money(toNum(tripFrom))}', style: const TextStyle(color: C.green, fontWeight: FontWeight.w700, fontSize: 13)),
                      ],
                    ]),
                  ),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Price(toNum(v['price_per_day']), size: 19),
                    const Text('per day', style: TextStyle(color: C.soft, fontSize: 12)),
                  ]),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
