import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

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
            _contactCard(),
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

  Widget _contactCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Customer care', style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        const Text('Hillbooker, No: 105A, Villagio, Green Groove, Jeyam Nagar, Kanchivakkam, Sriperumbudur, Chennai - 601301', style: TextStyle(color: C.soft, fontSize: 13.5)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          OutlinedButton.icon(
            onPressed: () => launchUrl(Uri.parse('tel:+918300841442')),
            icon: const Icon(Icons.call, size: 18),
            label: const Text('+91 83008 41442'),
          ),
          OutlinedButton.icon(
            onPressed: () => launchUrl(Uri.parse('tel:+919345777130')),
            icon: const Icon(Icons.call, size: 18),
            label: const Text('+91 93457 77130'),
          ),
          OutlinedButton.icon(
            onPressed: () => launchUrl(Uri.parse('https://wa.me/918300841442'), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.chat_outlined, size: 18),
            label: const Text('WhatsApp'),
          ),
        ]),
        const SizedBox(height: 12),
        const Text('Follow us', style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 4, children: [
          for (final s in const [
            ['Instagram', 'https://www.instagram.com/hillbookerbooking/'],
            ['Facebook', 'https://www.facebook.com/profile.php?id=61595981792268'],
            ['YouTube', 'https://www.youtube.com/channel/UCVHdOrRa9Ej6LSA1WKXQx4w'],
          ])
            OutlinedButton(
              onPressed: () => launchUrl(Uri.parse(s[1]), mode: LaunchMode.externalApplication),
              child: Text(s[0]),
            ),
        ]),
      ]),
    );
  }
}
