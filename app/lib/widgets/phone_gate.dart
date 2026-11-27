import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';

/// Every signed-in guest, host and operator must have a mobile number, like on the website.
/// The email sign-up already asks for one; "Sign up with Google" did not. This wraps the app and,
/// whenever someone is logged in (at start-up or right after a Google sign-in) without a number,
/// shows a box they can't close until they save one. The only other way out is "Log out".
/// Admins are not stopped.
class PhoneGate extends StatefulWidget {
  final Widget child;
  const PhoneGate({super.key, required this.child});

  @override
  State<PhoneGate> createState() => _PhoneGateState();
}

class _PhoneGateState extends State<PhoneGate> {
  String? _checkedToken; // the login we last checked, so each login is checked once
  bool _open = false;

  @override
  void initState() {
    super.initState();
    session.addListener(_check);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  void dispose() {
    session.removeListener(_check);
    super.dispose();
  }

  Future<void> _check() async {
    final token = session.token;
    if (token == null) {
      _checkedToken = null;
      return;
    }
    if (_open || token == _checkedToken || session.role == 'admin') return;
    _checkedToken = token;
    final res = await Api.get('/auth/phone');
    if (!mounted || session.token != token) return;
    final phone = (res.ok && res.data is Map) ? (res.data['phone'] ?? '').toString() : 'unknown';
    if (phone.isNotEmpty) return; // has a number, or the check failed (don't block on a network error)
    _open = true;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _PhoneDialog(),
    );
    _open = false;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _PhoneDialog extends StatefulWidget {
  const _PhoneDialog();

  @override
  State<_PhoneDialog> createState() => _PhoneDialogState();
}

class _PhoneDialogState extends State<_PhoneDialog> {
  final _phone = TextEditingController();
  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final phone = _phone.text.trim();
    if (phone.replaceAll(RegExp(r'\D'), '').length < 10) {
      setState(() => _error = 'Enter your 10-digit mobile number.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    final res = await Api.put('/auth/phone', body: {'phone': phone});
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _busy = false;
        _error = res.error.isNotEmpty ? res.error : 'Could not save. Try again.';
      });
      return;
    }
    Navigator.of(context).pop();
  }

  Future<void> _logout() async {
    Navigator.of(context).pop();
    await session.logout();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false, // the back button doesn't close it
      child: AlertDialog(
        title: const Text('One more step: your mobile number'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Hosts use it to reach you about your stay, and we send your booking confirmation and invoice to your WhatsApp.'),
            const SizedBox(height: 12),
            TextField(
              controller: _phone,
              autofocus: true,
              keyboardType: TextInputType.phone,
              decoration: fieldDeco('Mobile number', hint: '98765 43210'),
              onSubmitted: (_) => _busy ? null : _save(),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
        actions: [
          TextButton(onPressed: _busy ? null : _logout, child: const Text('Log out')),
          FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save and continue')),
        ],
      ),
    );
  }
}
