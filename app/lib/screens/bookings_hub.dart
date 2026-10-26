import 'package:flutter/material.dart';

import '../session.dart';
import 'bookings_screen.dart';
import 'vehicle_bookings_screen.dart';

// The Bookings tab: a switch between room stays and vehicle bookings.
class BookingsHub extends StatelessWidget {
  const BookingsHub({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: showVehicleBookings,
      builder: (context, vehicles, _) {
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: SizedBox(
                width: double.infinity,
                child: SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment<bool>(value: false, label: Text('Stays'), icon: Icon(Icons.hotel_outlined)),
                    ButtonSegment<bool>(value: true, label: Text('Vehicles'), icon: Icon(Icons.directions_car_outlined)),
                  ],
                  selected: {vehicles},
                  onSelectionChanged: (s) => showVehicleBookings.value = s.first,
                ),
              ),
            ),
            Expanded(child: vehicles ? const VehicleBookingsScreen() : const BookingsScreen()),
          ],
        );
      },
    );
  }
}
