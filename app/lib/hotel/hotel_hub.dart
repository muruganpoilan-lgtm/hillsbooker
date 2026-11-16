import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'expenses_screen.dart';
import 'extras_screen.dart';
import 'guests_screen.dart';
import 'hotel_common.dart';
import 'rooms_screen.dart';
import 'salary_screen.dart';
import 'staff_screen.dart';
import 'stock_screen.dart';

// Manage my hotel. The same seven sections as the website: rooms, guests, staff,
// salary, orders, expenses and stock, for one property at a time.

class _Section {
  final String label;
  final IconData icon;
  const _Section(this.label, this.icon);
}

const List<_Section> _sections = [
  _Section('Rooms', Icons.meeting_room_outlined),
  _Section('Guests', Icons.people_outline),
  _Section('Staff', Icons.badge_outlined),
  _Section('Salary', Icons.payments_outlined),
  _Section('Orders', Icons.restaurant_outlined),
  _Section('Expenses', Icons.receipt_long_outlined),
  _Section('Stock', Icons.inventory_2_outlined),
];

class HotelHub extends StatefulWidget {
  const HotelHub({super.key});

  @override
  State<HotelHub> createState() => _HotelHubState();
}

class _HotelHubState extends State<HotelHub> {
  List<Map<String, dynamic>> _properties = [];
  String? _propertyId;
  int _section = 0;
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    final res = await Api.get('/hotel/properties');
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _loading = false;
        _error = res.error;
      });
      return;
    }
    final rows = rowList(res.data);
    setState(() {
      _loading = false;
      _properties = rows;
      if (rows.isNotEmpty && (_propertyId == null || !rows.any((p) => text(p['id']) == _propertyId))) {
        _propertyId = text(rows.first['id']);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: C.green));
    if (_error.isNotEmpty) {
      return ErrorBox(title: "We couldn't open your hotel", message: _error, onRetry: _load);
    }
    if (_properties.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('No property yet', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 19, color: C.ink)),
          SizedBox(height: 6),
          Text(
            'Add a property under Properties first. Once it is there you can manage its rooms, guests and staff here.',
            style: TextStyle(color: C.soft),
          ),
        ]),
      );
    }

    final id = _propertyId!;
    return Column(children: [
      if (_properties.length > 1)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: DropdownButtonFormField<String>(
            initialValue: id,
            isExpanded: true,
            decoration: fieldDeco('Which place'),
            items: _properties
                .map((p) => DropdownMenuItem<String>(
                      value: text(p['id']),
                      child: Text('${p['name']} · ${p['city']}', overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _propertyId = v);
            },
          ),
        ),
      SizedBox(
        height: 54,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          itemCount: _sections.length,
          itemBuilder: (ctx, i) {
            final s = _sections[i];
            final on = i == _section;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                selected: on,
                onSelected: (_) => setState(() => _section = i),
                avatar: Icon(s.icon, size: 17, color: on ? Colors.white : C.soft),
                label: Text(s.label),
                labelStyle: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: on ? Colors.white : C.ink,
                ),
                selectedColor: C.green,
                backgroundColor: Colors.white,
                showCheckmark: false,
                side: BorderSide(color: on ? C.green : C.line),
              ),
            );
          },
        ),
      ),
      Expanded(child: _body(id)),
    ]);
  }

  Widget _body(String id) {
    // A key per property and section so switching either one reloads from scratch.
    switch (_section) {
      case 1:
        return GuestsSection(key: ValueKey('guests-$id'), propertyId: id);
      case 2:
        return StaffSection(key: ValueKey('staff-$id'), propertyId: id);
      case 3:
        return SalarySection(key: ValueKey('salary-$id'), propertyId: id);
      case 4:
        return ExtrasSection(key: ValueKey('extras-$id'), propertyId: id);
      case 5:
        return ExpensesSection(key: ValueKey('expenses-$id'), propertyId: id);
      case 6:
        return StockSection(key: ValueKey('stock-$id'), propertyId: id);
      default:
        return RoomsSection(key: ValueKey('rooms-$id'), propertyId: id);
    }
  }
}
