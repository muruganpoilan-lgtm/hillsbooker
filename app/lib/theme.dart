import 'package:flutter/material.dart';

class C {
  static const ink = Color(0xFF17213B);
  static const soft = Color(0xFF4A5470);
  static const green = Color(0xFF0E6B58);
  static const greenDark = Color(0xFF0A5042);
  static const gold = Color(0xFFF4B000);
  static const goldText = Color(0xFF8A5B00);
  static const indigo = Color(0xFF2A3A7A);
  static const chalk = Color(0xFFF4F6F2);
  static const line = Color(0xFFD5DDD6);
  static const brick = Color(0xFFB3362B);
}

// Same type as the website: Figtree (Tamil letters fall back to the phone's Noto Sans Tamil).
const kFont = 'Figtree';

TextStyle display(double size, {Color color = C.ink}) => TextStyle(
      fontFamily: kFont,
      fontSize: size,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.4,
      height: 1.12,
      color: color,
    );

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: C.green, primary: C.green, surface: Colors.white);
  return ThemeData(
    useMaterial3: true,
    fontFamily: kFont,
    colorScheme: scheme,
    // White pages, like the website (C.chalk stays for small fills).
    scaffoldBackgroundColor: Colors.white,
    cardTheme: CardThemeData(
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: C.line),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      foregroundColor: C.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: C.green,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 48),
        textStyle: const TextStyle(fontFamily: kFont, fontWeight: FontWeight.w700, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: C.ink,
        minimumSize: const Size(0, 44),
        side: const BorderSide(color: C.ink, width: 1.8),
        textStyle: const TextStyle(fontFamily: kFont, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: const Color(0x330E6B58),
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontFamily: kFont, fontWeight: FontWeight.w700, fontSize: 12)),
    ),
  );
}

// Text field look used everywhere (kept here, not in ThemeData, so it works on every Flutter version).
InputDecoration fieldDeco(String label, {String? hint, Widget? prefix, Widget? suffix}) {
  const border = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(6)),
    borderSide: BorderSide(color: Color(0xFFAAB5AC)),
  );
  return InputDecoration(
    labelText: label,
    hintText: hint,
    prefixIcon: prefix,
    suffixIcon: suffix,
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    border: border,
    enabledBorder: border,
  );
}
