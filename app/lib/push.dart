import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'firebase_options.dart';

// Lets the server show a notification on this phone: a new booking for hosts, a confirmation for guests.
// Everything here is best effort. If Firebase isn't set up, or the person says no, the app works as before.
final GlobalKey<ScaffoldMessengerState> messengerKey = GlobalKey<ScaffoldMessengerState>();

class Push {
  static bool _ready = false;
  static String? _token;
  static bool _listening = false;

  static Future<void> init() async {
    try {
      if (!DefaultFirebaseOptions.isConfigured) return;
      await Firebase.initializeApp(options: DefaultFirebaseOptions.android);
      _ready = true;
    } catch (_) {}
  }

  // Call after someone logs in (and when the app opens while logged in).
  static Future<void> register() async {
    if (!_ready || Api.token == null) return;
    try {
      final m = FirebaseMessaging.instance;
      await m.requestPermission();
      final t = await m.getToken();
      if (t == null) return;
      _token = t;
      await Api.post('/push/register', body: {'token': t});
      if (!_listening) {
        _listening = true;
        m.onTokenRefresh.listen((n) {
          _token = n;
          if (Api.token != null) Api.post('/push/register', body: {'token': n});
        });
        // Notifications are shown by Android while the app is closed; while it is open, show a small banner instead.
        FirebaseMessaging.onMessage.listen((msg) {
          final n = msg.notification;
          if (n == null) return;
          messengerKey.currentState?.showSnackBar(SnackBar(content: Text([n.title, n.body].where((x) => x != null && x.isNotEmpty).join(': '))));
        });
      }
    } catch (_) {}
  }

  // Call before the login token is cleared, so the next person on this phone doesn't get these alerts.
  static Future<void> unregister() async {
    final t = _token;
    if (!_ready || t == null || Api.token == null) return;
    try {
      await Api.post('/push/unregister', body: {'token': t});
    } catch (_) {}
  }

  static bool get ready => _ready;
}
