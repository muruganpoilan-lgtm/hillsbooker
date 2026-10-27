import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'vehicle_common.dart';

// Confirmed and cancelled bookings for the operator's vehicles (all vehicles for an admin).
class OperatorBookingsScreen extends StatefulWidget {
  const OperatorBookingsScreen({super.key});

  @override
  State<OperatorBookingsScreen> createState() => _OperatorBookingsScreenState();
}

class _OperatorBookingsScreenState extends State<OperatorBookingsScreen> {
  List<Map<String, dynamic>>? _rows;
  String _error = '';
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    // Refresh every 30 seconds so cancellations and new bookings appear by themselves.
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final res = await Api.get('/operator/vehicle-bookings');
    if (!mounted) return;
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    setState(() {
      _error = '';
      _rows = (res.data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    return Scaffold(
      appBar: AppBar(title: Text('Vehicle bookings', style: display(20))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            if (_error.isNotEmpty) ErrorBox(title: "We couldn't load bookings", message: _error, onRetry: _load),
            if (rows == null && _error.isEmpty) const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator(color: C.green))),
            if (rows != null && rows.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Text('No confirmed bookings yet.', style: TextStyle(color: C.soft, fontSize: 15))),
            if (rows != null) for (final b in rows) _card(b),
          ],
        ),
      ),
    );
  }

  Widget _card(Map<String, dynamic> b) {
    final status = '${b['status']}';
    final start = parseDay('${b['start_date']}');
    final end = parseDay('${b['end_date']}');
    final dates = start == end ? prettyDayYear(start) : '${prettyDayYear(start)} to ${prettyDayYear(end)}';
    final phone = '${b['guest_phone'] ?? ''}';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${b['guest']}', style: display(17)),
            if (phone.isNotEmpty) Text(phone, style: const TextStyle(color: C.soft)),
            const SizedBox(height: 2),
            Text('${b['vehicle']}${toNum(b['count']) > 1 ? ' × ${b['count']}' : ''} · ${b['trip'] ?? 'By the day'}', style: const TextStyle(color: C.soft)),
            Text('${plural(toNum(b['passengers']).toInt(), 'passenger')}${'${b['pickup'] ?? ''}'.isNotEmpty ? ' · pickup ${b['pickup']}' : ''}', style: const TextStyle(color: C.soft)),
            if ('${b['note'] ?? ''}'.isNotEmpty) Text('Note: ${b['note']}', style: const TextStyle(color: C.soft)),
            const SizedBox(height: 4),
            Text(dates),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Price(toNum(b['total_amount']), size: 17),
          const SizedBox(height: 4),
          if (toNum(b['balance_due']) > 0 && status == 'confirmed') Text('Collect ${money(toNum(b['balance_due']))}', style: const TextStyle(color: C.green, fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 6),
          Pill(vehicleStatusLabel[status] ?? status, vehicleStatusColor(status)),
        ]),
      ]),
    );
  }
}
