import 'package:flutter/material.dart';

import 'api.dart';
import 'screens/account_screen.dart';
import 'screens/bookings_hub.dart';
import 'screens/home_screen.dart';
import 'screens/manage_hub.dart';
import 'session.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await session.load();
  // If the server says the login has expired, log out so the app asks again.
  Api.onUnauthorized = () {
    if (session.token != null) session.logout();
  };
  runApp(const HillBookerApp());
}

class HillBookerApp extends StatelessWidget {
  const HillBookerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hill Booker',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const Shell(),
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
              bottomNavigationBar: NavigationBar(
                selectedIndex: index,
                onDestinationSelected: (i) => tabIndex.value = i,
                destinations: [
                  const NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
                  const NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), selectedIcon: Icon(Icons.confirmation_number), label: 'Bookings'),
                  const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
                  if (manager) const NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Manage'),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
