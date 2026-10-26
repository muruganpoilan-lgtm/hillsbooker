import 'package:flutter/material.dart';

import '../session.dart';
import 'operator_home_screen.dart';
import 'owner_home_screen.dart';

// The Manage tab. Owners see their properties, operators their vehicles, and an admin can switch between both.
class ManageHub extends StatefulWidget {
  const ManageHub({super.key});

  @override
  State<ManageHub> createState() => _ManageHubState();
}

class _ManageHubState extends State<ManageHub> {
  bool _vehicles = false;

  @override
  Widget build(BuildContext context) {
    final role = session.role;
    if (role == 'operator') return const OperatorHomeScreen();
    if (role != 'admin') return const OwnerHomeScreen();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: SizedBox(
            width: double.infinity,
            child: SegmentedButton<bool>(
              segments: const [
                ButtonSegment<bool>(value: false, label: Text('Properties'), icon: Icon(Icons.hotel_outlined)),
                ButtonSegment<bool>(value: true, label: Text('Vehicles'), icon: Icon(Icons.directions_car_outlined)),
              ],
              selected: {_vehicles},
              onSelectionChanged: (s) => setState(() => _vehicles = s.first),
            ),
          ),
        ),
        Expanded(child: _vehicles ? const OperatorHomeScreen() : const OwnerHomeScreen()),
      ],
    );
  }
}
