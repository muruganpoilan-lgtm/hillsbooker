import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'host_payments_screen.dart';
import 'operator_bookings_screen.dart';
import 'owner_home_screen.dart' show propertyStatusColor, propertyStatusLabel;
import 'vehicle_common.dart';
import 'vehicle_form_screen.dart';
import 'vehicle_manage_screen.dart';

// A travel operator's vehicles (every vehicle for an admin, who also approves new ones).
class OperatorHomeScreen extends StatefulWidget {
  const OperatorHomeScreen({super.key});

  @override
  State<OperatorHomeScreen> createState() => _OperatorHomeScreenState();
}

class _OperatorHomeScreenState extends State<OperatorHomeScreen> {
  List<Map<String, dynamic>>? _rows;
  List<Map<String, dynamic>> _pending = [];
  String _error = '';

  bool get _isAdmin => session.role == 'admin';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Api.get('/operator/vehicles');
    if (!mounted) return;
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    var pending = <Map<String, dynamic>>[];
    if (_isAdmin) {
      final p = await Api.get('/admin/vehicles/pending');
      if (p.ok) pending = (p.data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }
    if (!mounted) return;
    setState(() {
      _error = '';
      _rows = (res.data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      _pending = pending;
    });
  }

  Future<void> _decide(String id, String action) async {
    final res = await Api.post('/admin/vehicles/$id/$action');
    if (!mounted) return;
    if (!res.ok) snack(context, res.error);
    _load();
  }

  Future<void> _add() async {
    final id = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const VehicleFormScreen()));
    if (!mounted) return;
    if (id != null) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => VehicleManageScreen(vehicleId: id)));
    }
    if (mounted) _load();
  }

  Future<void> _open(String id) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => VehicleManageScreen(vehicleId: id)));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    return Scaffold(
      appBar: AppBar(
        title: Text(_isAdmin ? 'All vehicles' : 'Your vehicles', style: display(20)),
        actions: [
          IconButton(
            tooltip: 'Bookings',
            icon: const Icon(Icons.confirmation_number_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const OperatorBookingsScreen())),
          ),
          IconButton(
            tooltip: 'Payments',
            icon: const Icon(Icons.payments_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const HostPaymentsScreen())),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        backgroundColor: C.green,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Add a vehicle'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
          children: [
            if (_error.isNotEmpty) ErrorBox(title: "We couldn't load your vehicles", message: _error, onRetry: _load),
            if (_pending.isNotEmpty) ...[
              Text('Waiting for your approval', style: display(18)),
              const SizedBox(height: 8),
              for (final p in _pending) _pendingCard(p),
              const SizedBox(height: 16),
            ],
            if (rows == null && _error.isEmpty) const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator(color: C.green))),
            if (rows != null && rows.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text('No vehicles yet. Add your first one, then its photos and fixed-price trips.', style: TextStyle(color: C.soft, fontSize: 15)),
              ),
            if (rows != null) for (final v in rows) _card(v),
          ],
        ),
      ),
    );
  }

  Widget _pendingCard(Map<String, dynamic> p) {
    final id = p['id'].toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.gold, width: 2), borderRadius: BorderRadius.circular(8)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InkWell(onTap: () => _open(id), child: Text('${p['name']}', style: display(17))),
        const SizedBox(height: 2),
        Text('${kindLabel('${p['kind']}')} · ${p['seats']} seats · ${p['city']} · ${money(toNum(p['price_per_day']))}/day', style: const TextStyle(color: C.soft, fontSize: 13)),
        Text('${p['operator']} (${p['operator_email']})', style: const TextStyle(color: C.soft, fontSize: 13)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: FilledButton(onPressed: () => _decide(id, 'approve'), child: const Text('Approve'))),
          const SizedBox(width: 10),
          OutlinedButton(
            onPressed: () => _decide(id, 'reject'),
            style: OutlinedButton.styleFrom(foregroundColor: C.brick, side: const BorderSide(color: C.brick, width: 1.8)),
            child: const Text('Reject'),
          ),
        ]),
      ]),
    );
  }

  Widget _card(Map<String, dynamic> v) {
    final status = '${v['status']}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => _open(v['id'].toString()),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              Icon(kindIcon('${v['kind']}'), color: C.green, size: 30),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${v['name']}', style: display(18)),
                  const SizedBox(height: 2),
                  Text('${kindLabel('${v['kind']}')} · ${v['seats']} seats · ${v['city']} · ${money(toNum(v['price_per_day']))}/day', style: const TextStyle(color: C.soft)),
                  const SizedBox(height: 8),
                  Pill(propertyStatusLabel(status), propertyStatusColor(status)),
                ]),
              ),
              const Icon(Icons.chevron_right, color: C.soft),
            ]),
          ),
        ),
      ),
    );
  }
}
