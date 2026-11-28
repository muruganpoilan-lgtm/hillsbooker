import 'package:flutter/material.dart';

import 'api.dart';
import 'push.dart';
import 'screens/account_screen.dart';
import 'screens/bookings_hub.dart';
import 'screens/home_screen.dart';
import 'screens/manage_hub.dart';
import 'session.dart';
import 'widgets/phone_gate.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await session.load();
  // If the server says the login has expired, log out so the app asks again.
  Api.onUnauthorized = () {
    if (session.token != null) session.logout();
  };
  await Push.init();
  if (session.token != null) Push.register();
  runApp(const HillBookerApp());
}

class HillBookerApp extends StatelessWidget {
  const HillBookerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hill Booker',
      scaffoldMessengerKey: messengerKey,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const PhoneGate(child: Shell()), // asks for a mobile number if a logged-in account has none
    );
  }
}

class Shell extends StatelessWidget {
  const Shell({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final manager = session.token != null && (session.role == 'owner' || session.role == 'admin' || session.role == 'operator');
        return ValueListenableBuilder<int>(
          valueListenable: tabIndex,
          builder: (context, rawIndex, _) {
            final count = manager ? 4 : 3;
            // If the Manage tab goes away (log out), fall back to the last tab that exists.
            final index = rawIndex >= count ? count - 1 : rawIndex;
            // Tabs are rebuilt when opened, so lists always show fresh data.
            final pages = <Widget>[
              const HomeScreen(),
              const BookingsHub(),
              const AccountScreen(),
              if (manager) const ManageHub(),
            ];
            return Scaffold(
              body: SafeArea(top: index != 0, child: pages[index]),
              // Thin line on top so the white tab bar stays apart from the white page.
              bottomNavigationBar: DecoratedBox(
                decoration: const BoxDecoration(border: Border(top: BorderSide(color: C.line))),
                child: NavigationBar(
                selectedIndex: index,
                onDestinationSelected: (i) => tabIndex.value = i,
                destinations: [
                  const NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
                  const NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), selectedIcon: Icon(Icons.confirmation_number), label: 'Bookings'),
                  const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
                  if (manager) const NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Manage'),
                ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
