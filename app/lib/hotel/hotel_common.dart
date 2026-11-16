import 'package:flutter/material.dart';

import '../format.dart';
import '../theme.dart';

// Shared pieces for every Manage my hotel screen: the words the server uses,
// small layout helpers, and the pickers the forms need.

const Map<String, String> roomStatusNames = {
  'free': 'Free',
  'occupied': 'Occupied',
  'cleaning': 'Cleaning',
  'repair': 'Repair',
};

Color roomStatusColor(String status) {
  switch (status) {
    case 'occupied':
      return C.brick;
    case 'cleaning':
      return C.goldText;
    case 'repair':
      return C.soft;
    default:
      return C.green;
  }
}

Color roomStatusFill(String status) {
  switch (status) {
    case 'occupied':
      return const Color(0xFFFBECEA);
    case 'cleaning':
      return const Color(0xFFFDF4DF);
    case 'repair':
      return const Color(0xFFEFF1EE);
    default:
      return const Color(0xFFE7F2EF);
  }
}

const Map<String, String> idTypeNames = {
  'aadhaar': 'Aadhaar (last 4 digits)',
  'voter': 'Voter ID',
  'driving': 'Driving licence',
  'passport': 'Passport',
  'pan': 'PAN card',
  'other': 'Other ID',
};

const Map<String, String> extraKindNames = {
  'food': 'Food and drinks',
  'laundry': 'Laundry',
  'travel': 'Travel desk',
  'other': 'Other',
};

const Map<String, String> expenseKindNames = {
  'groceries': 'Groceries',
  'electricity': 'Electricity',
  'water': 'Water',
  'gas': 'Gas',
  'repairs': 'Repairs',
  'laundry': 'Laundry',
  'supplies': 'Supplies',
  'fuel': 'Fuel',
  'rent': 'Rent',
  'other': 'Other',
};

const Map<String, String> payMethodNames = {
  'cash': 'Cash',
  'upi': 'UPI',
  'bank': 'Bank transfer',
  'card': 'Card',
};

const Map<String, String> stockKindNames = {
  'linen': 'Linen',
  'toiletries': 'Toiletries',
  'kitchen': 'Kitchen',
  'cleaning': 'Cleaning',
  'other': 'Other',
};

const Map<String, String> moveReasonNames = {
  'purchase': 'Bought',
  'used': 'Used',
  'damaged': 'Damaged or lost',
  'correction': 'Counted again',
};

const Map<String, String> attendanceNames = {
  'present': 'Present',
  'half': 'Half day',
  'leave': 'Leave',
  'absent': 'Absent',
};

Color attendanceColor(String? status) {
  switch (status) {
    case 'present':
      return C.green;
    case 'half':
      return C.goldText;
    case 'leave':
      return C.indigo;
    case 'absent':
      return C.brick;
    default:
      return C.soft;
  }
}

// ---------- small helpers ----------

/// Rows out of the API arrive as List<dynamic> of maps. This makes them usable.
List<Map<String, dynamic>> rowList(dynamic v) =>
    v is List ? v.map((e) => Map<String, dynamic>.from(e as Map)).toList() : <Map<String, dynamic>>[];

Map<String, dynamic> rowMap(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

String text(dynamic v) => v == null ? '' : '$v';

/// A quantity without trailing zeros: 2 rather than 2.00, but 2.5 stays 2.5.
String qtyText(dynamic v) {
  final n = toNum(v);
  if (n == n.roundToDouble()) return n.round().toString();
  return n.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

DateTime? tryDay(dynamic v) {
  final s = text(v);
  if (s.length < 10) return null;
  try {
    return parseDay(s.substring(0, 10));
  } catch (_) {
    return null;
  }
}

String dayText(dynamic v) {
  final d = tryDay(v);
  return d == null ? '' : prettyDay(d);
}

String dayYearText(dynamic v) {
  final d = tryDay(v);
  return d == null ? '' : prettyDayYear(d);
}

String monthKey(DateTime d) => '${d.year}-${two(d.month)}';

const List<String> monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

String monthTitle(String key) {
  final parts = key.split('-');
  if (parts.length < 2) return key;
  final m = int.tryParse(parts[1]) ?? 1;
  return '${monthNames[(m - 1).clamp(0, 11)]} ${parts[0]}';
}

DateTime monthFrom(String key) {
  final parts = key.split('-');
  return DateTime(int.tryParse(parts[0]) ?? today().year, int.tryParse(parts.length > 1 ? parts[1] : '1') ?? 1, 1);
}

String shiftMonth(String key, int by) {
  final m = monthFrom(key);
  return monthKey(DateTime(m.year, m.month + by, 1));
}

// ---------- shared widgets ----------

/// A white card with a hairline border, used for every row and panel.
class HCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final Color? fill;
  final Color? border;

  const HCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(14),
    this.fill,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final inner = Container(
      padding: padding,
      decoration: BoxDecoration(
        border: Border.all(color: border ?? C.line),
        borderRadius: BorderRadius.circular(8),
      ),
      child: child,
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: fill ?? Colors.white,
        borderRadius: BorderRadius.circular(8),
        child: onTap == null ? inner : InkWell(borderRadius: BorderRadius.circular(8), onTap: onTap, child: inner),
      ),
    );
  }
}

/// A heading above a list, with an optional button on the right.
class HHeading extends StatelessWidget {
  final String title;
  final Widget? action;
  const HHeading(this.title, {super.key, this.action});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        Expanded(child: Text(title, style: display(18))),
        if (action != null) action!,
      ]),
    );
  }
}

/// A line of the form "Paid   ₹4,500", used in totals panels and bills.
class HLine extends StatelessWidget {
  final String label;
  final String value;
  final bool strong;
  final Color? color;
  const HLine(this.label, this.value, {super.key, this.strong = false, this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Expanded(
          child: Text(label, style: TextStyle(color: color ?? C.soft, fontWeight: strong ? FontWeight.w700 : FontWeight.w400)),
        ),
        Text(
          value,
          style: TextStyle(
            color: color ?? C.ink,
            fontWeight: strong ? FontWeight.w800 : FontWeight.w700,
            fontSize: strong ? 16 : 14.5,
          ),
        ),
      ]),
    );
  }
}

/// The grey box of totals that sits at the top of most screens.
class HTotals extends StatelessWidget {
  final List<Widget> children;
  const HTotals({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    return HCard(
      fill: Colors.white,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
    );
  }
}

/// Nothing-here text, so an empty screen still explains itself.
class HEmpty extends StatelessWidget {
  final String message;
  const HEmpty(this.message, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Text(message, style: const TextStyle(color: C.soft)),
    );
  }
}

/// A labelled dropdown that matches the text fields.
class HChoice extends StatelessWidget {
  final String label;
  final String? value;
  final Map<String, String> options;
  final ValueChanged<String?> onChanged;
  final String? emptyLabel;

  const HChoice({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    this.emptyLabel,
  });

  @override
  Widget build(BuildContext context) {
    final items = <DropdownMenuItem<String?>>[];
    if (emptyLabel != null) {
      items.add(DropdownMenuItem<String?>(value: null, child: Text(emptyLabel!)));
    }
    options.forEach((k, v) => items.add(DropdownMenuItem<String?>(value: k, child: Text(v))));
    return DropdownButtonFormField<String?>(
      initialValue: value,
      isExpanded: true,
      decoration: fieldDeco(label),
      items: items,
      onChanged: onChanged,
    );
  }
}

/// A date shown as a button. Tapping it opens the calendar.
class HDateField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onChanged;
  final DateTime? first;
  final DateTime? last;

  const HDateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.first,
    this.last,
  });

  @override
  Widget build(BuildContext context) {
    final v = value;
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: v ?? today(),
          firstDate: first ?? DateTime(today().year - 3),
          lastDate: last ?? DateTime(today().year + 3),
        );
        if (picked != null) onChanged(DateTime(picked.year, picked.month, picked.day));
      },
      child: InputDecorator(
        decoration: fieldDeco(label, suffix: const Icon(Icons.calendar_today_outlined, size: 18)),
        child: Text(
          v == null ? 'Choose' : prettyDayYear(v),
          style: TextStyle(color: v == null ? C.soft : C.ink, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

/// Money typed by the host. Returns null when the box is empty.
double? parseMoney(String raw) {
  final s = raw.trim().replaceAll(',', '').replaceAll('₹', '');
  if (s.isEmpty) return null;
  return double.tryParse(s);
}

/// Sends a number to the API the way the server wants it: a plain number, two decimals at most.
num moneyOut(double v) => double.parse(v.toStringAsFixed(2));

/// A month strip with arrows on either side of the month name.
class HMonthBar extends StatelessWidget {
  final String month;
  final ValueChanged<String> onChanged;
  const HMonthBar({super.key, required this.month, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      IconButton(
        tooltip: 'Previous month',
        icon: const Icon(Icons.chevron_left),
        onPressed: () => onChanged(shiftMonth(month, -1)),
      ),
      Expanded(child: Center(child: Text(monthTitle(month), style: display(17)))),
      IconButton(
        tooltip: 'Next month',
        icon: const Icon(Icons.chevron_right),
        onPressed: () => onChanged(shiftMonth(month, 1)),
      ),
    ]);
  }
}

/// A bottom sheet holding a form. Keeps the keyboard from covering the fields.
Future<T?> hotelSheet<T>(BuildContext context, String title, Widget Function(BuildContext) body) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text(title, style: display(19))),
              IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(ctx).pop()),
            ]),
            const SizedBox(height: 6),
            body(ctx),
          ]),
        ),
      ),
    ),
  );
}
