import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'push.dart';

// Who is logged in. The token is kept on the phone so people stay logged in.
class Session extends ChangeNotifier {
  String? token;
  String? role;

  Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      token = p.getString('token');
      role = p.getString('role');
    } catch (_) {}
    Api.token = token;
  }

  // Swap the saved token for a fresh one each time the app opens, so anyone who uses the app
  // stays logged in. If the token has already run out, the API logs them out as before.
  Future<void> refresh() async {
    if (token == null) return;
    final res = await Api.post('/auth/refresh');
    if (res.ok && res.data is Map && res.data['token'] is String) {
      token = res.data['token'] as String;
      role = res.data['role'] as String;
      Api.token = token;
      try {
        final p = await SharedPreferences.getInstance();
        await p.setString('token', token!);
        await p.setString('role', role!);
      } catch (_) {}
    }
  }

  Future<void> login(String newToken, String newRole) async {
    token = newToken;
    role = newRole;
    Api.token = newToken;
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('token', newToken);
      await p.setString('role', newRole);
    } catch (_) {}
    Push.register();
    notifyListeners();
  }

  Future<void> logout() async {
    await Push.unregister();
    token = null;
    role = null;
    Api.token = null;
    try {
      final p = await SharedPreferences.getInstance();
      await p.remove('token');
      await p.remove('role');
    } catch (_) {}
    notifyListeners();
  }
}

final Session session = Session();

// The last email that logged in on this phone, filled in on the login screen next time.
Future<String?> lastEmail() async {
  try {
    return (await SharedPreferences.getInstance()).getString('lastEmail');
  } catch (_) {
    return null;
  }
}

Future<void> saveLastEmail(String email) async {
  try {
    await (await SharedPreferences.getInstance()).setString('lastEmail', email);
  } catch (_) {}
}

// Which tab of the bottom bar is open: 0 Search, 1 Bookings, 2 Account.
final ValueNotifier<int> tabIndex = ValueNotifier<int>(0);

// Which list the Bookings tab shows: false for stays, true for vehicles.
final ValueNotifier<bool> showVehicleBookings = ValueNotifier<bool>(false);
