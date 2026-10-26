import 'package:flutter/material.dart';

import '../theme.dart';

const vehicleKinds = <MapEntry<String, String>>[
  MapEntry('car', 'Car'),
  MapEntry('suv', 'SUV'),
  MapEntry('van', 'Van'),
  MapEntry('traveller', 'Tempo Traveller'),
  MapEntry('mini_bus', 'Mini bus'),
  MapEntry('bus', 'Bus'),
];

String kindLabel(String kind) {
  for (final k in vehicleKinds) {
    if (k.key == kind) return k.value;
  }
  return kind;
}

IconData kindIcon(String kind) {
  if (kind == 'bus' || kind == 'mini_bus') return Icons.directions_bus;
  if (kind == 'van' || kind == 'traveller') return Icons.airport_shuttle;
  return Icons.directions_car;
}

// One line describing a vehicle, e.g. "Tempo Traveller · 12 seats · AC · Munnar".
String vehicleLine(Map<String, dynamic> v) {
  final ac = v['ac'] == true ? 'AC' : 'Non-AC';
  return '${kindLabel('${v['kind']}')} · ${v['seats']} seats · $ac · ${v['city']}';
}

const vehicleStatusLabel = {'held': 'Waiting for payment', 'confirmed': 'Confirmed', 'cancelled': 'Cancelled', 'expired': 'Hold expired'};

Color vehicleStatusColor(String s) {
  if (s == 'confirmed') return C.green;
  if (s == 'held') return C.goldText;
  return C.soft;
}
