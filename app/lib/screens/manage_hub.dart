import 'package:flutter/material.dart';

import '../hotel/hotel_hub.dart';
import 'operator_home_screen.dart';
import 'owner_home_screen.dart';

// The Manage tab. Owners, operators and admins can switch between their properties,
// the day-to-day running of a hotel, and their vehicles.
class ManageHub extends StatefulWidget {
  const ManageHub({super.key});

  @override
  State<ManageHub> createState() => _ManageHubState();
}

class _ManageHubState extends State<ManageHub> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: SizedBox(
            width: double.infinity,
            child: SegmentedButton<int>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment<int>(value: 0, label: Text('Properties'), icon: Icon(Icons.hotel_outlined)),
                ButtonSegment<int>(value: 1, label: Text('My hotel'), icon: Icon(Icons.meeting_room_outlined)),
                ButtonSegment<int>(value: 2, label: Text('Vehicles'), icon: Icon(Icons.directions_car_outlined)),
              ],
              selected: {_tab},
              onSelectionChanged: (s) => setState(() => _tab = s.first),
            ),
          ),
        ),
        Expanded(child: _body()),
      ],
    );
  }

  Widget _body() {
    switch (_tab) {
      case 1:
        return const HotelHub();
      case 2:
        return const OperatorHomeScreen();
      default:
        return const OwnerHomeScreen();
    }
  }
}
