import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import 'login_screen.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final loggedIn = session.token != null;
        final role = session.role ?? 'guest';
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text('Account', style: display(30)),
            const SizedBox(height: 16),
            if (!loggedIn) ...[
              const Text('Log in to reserve rooms and see your bookings.', style: TextStyle(color: C.soft, fontSize: 15)),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
                child: const Text('Log in'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen(startOnSignUp: true))),
                child: const Text('Create an account'),
              ),
            ] else ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
                child: Row(children: [
                  const Icon(Icons.person, color: C.green),
                  const SizedBox(width: 10),
                  Text(role == 'guest' ? 'Guest account' : (role == 'admin' ? 'Admin account' : 'Host account (properties and vehicles)'), style: const TextStyle(fontWeight: FontWeight.w700)),
                ]),
              ),
              if (role == 'guest')
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: FilledButton.icon(
                    onPressed: () async {
                      final res = await Api.post('/auth/become-host');
                      if (!context.mounted) return;
                      if (res.ok) {
                        await session.login(res.data['token'] as String, res.data['role'] as String);
                        tabIndex.value = 3;
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.error.isEmpty ? 'Could not switch to a host account' : res.error)));
                      }
                    },
                    icon: const Icon(Icons.storefront),
                    label: const Text('Become a host'),
                  ),
                ),
              if (role != 'guest')
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: FilledButton.icon(
                    onPressed: () => tabIndex.value = 3,
                    icon: const Icon(Icons.storefront),
                    label: const Text('Manage your listings'),
                  ),
                ),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: () => session.logout(), child: const Text('Log out')),
            ],
          ],
        );
      },
    );
  }
}
