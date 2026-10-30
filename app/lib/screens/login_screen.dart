import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../config.dart';
import '../session.dart';
import '../theme.dart';

// Log in or create a guest account. Pops with `true` once the person is logged in.
class LoginScreen extends StatefulWidget {
  final bool startOnSignUp;
  const LoginScreen({super.key, this.startOnSignUp = false});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late bool _signUp;
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hide = true;
  String _role = 'guest';
  String _error = '';
  bool _googleOn = false;

  @override
  void initState() {
    super.initState();
    _signUp = widget.startOnSignUp;
    _checkGoogle();
  }

  Future<void> _checkGoogle() async {
    final res = await Api.get('/auth/google/config');
    if (mounted && res.ok && res.data is Map && res.data['enabled'] == true) setState(() => _googleOn = true);
  }

  // Opens Google's sign-in page in the phone's browser; the server sends us back to hillbooker://auth with a token.
  Future<void> _google() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final role = _signUp ? _role : 'guest';
      final result = await FlutterWebAuth2.authenticate(url: '$apiBase/auth/google/start?target=app&role=$role', callbackUrlScheme: 'hillbooker');
      final q = Uri.parse(result).queryParameters;
      final token = q['token'];
      final r = q['role'];
      if (token == null || r == null) {
        if (mounted) {
          setState(() {
            _busy = false;
            _error = q['error'] ?? 'Google sign-in did not finish. Try again.';
          });
        }
        return;
      }
      await session.login(token, r);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on PlatformException {
      if (mounted) setState(() => _busy = false); // closed the Google page without choosing
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Google sign-in did not work. Try again.';
        });
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    if (_signUp && _name.text.trim().isEmpty) {
      setState(() => _error = 'Enter your name.');
      return;
    }
    if (_signUp && password.length < 8) {
      setState(() => _error = 'Your password needs at least 8 characters.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    final ApiResult res;
    if (_signUp) {
      final phone = _phone.text.trim();
      if (phone.replaceAll(RegExp(r'\D'), '').length < 10) {
        setState(() {
          _busy = false;
          _error = 'Enter your 10-digit mobile number.';
        });
        return;
      }
      res = await Api.post('/auth/register', body: {
        'name': _name.text.trim(),
        'email': email,
        'phone': phone,
        'password': password,
        'role': _role,
      });
    } else {
      res = await Api.post('/auth/login', body: {'email': email, 'password': password});
    }
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _busy = false;
        _error = res.error;
      });
      return;
    }
    await session.login(res.data['token'] as String, res.data['role'] as String);
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
        children: [
          Center(child: Image.asset('assets/logo.png', height: 120)),
          const SizedBox(height: 12),
          Text(_signUp ? 'Create your account' : 'Log in', style: display(30)),
          const SizedBox(height: 20),
          if (_signUp) ...[
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: fieldDeco('Full name')),
            const SizedBox(height: 14),
          ],
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: fieldDeco('Email'),
          ),
          if (_signUp) ...[
            const SizedBox(height: 14),
            TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: fieldDeco('Mobile number')),
            const SizedBox(height: 12),
            const Text('I am signing up to', style: TextStyle(fontWeight: FontWeight.w700, color: C.soft)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(label: const Text('Book trips'), selected: _role == 'guest', onSelected: (_) => setState(() => _role = 'guest')),
                ChoiceChip(label: const Text('List property or vehicles'), selected: _role == 'owner', onSelected: (_) => setState(() => _role = 'owner')),
              ],
            ),
          ],
          const SizedBox(height: 14),
          TextField(
            controller: _password,
            obscureText: _hide,
            onSubmitted: (_) => _submit(),
            decoration: fieldDeco(
              'Password',
              suffix: IconButton(
                icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                tooltip: _hide ? 'Show password' : 'Hide password',
                onPressed: () => setState(() => _hide = !_hide),
              ),
            ),
          ),
          if (!_signUp)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => launchUrl(Uri.parse('https://hillbooker.com/forgot-password'), mode: LaunchMode.externalApplication),
                child: const Text('Forgot password?'),
              ),
            ),
          if (_error.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error, style: const TextStyle(color: C.brick, fontWeight: FontWeight.w600)),
            ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: Text(_busy ? (_signUp ? 'Creating your account…' : 'Logging in…') : (_signUp ? 'Create account' : 'Log in')),
          ),
          if (_googleOn) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: _busy ? null : _google,
              icon: const Icon(Icons.account_circle_outlined),
              label: Text(_signUp ? 'Sign up with Google' : 'Continue with Google'),
            ),
          ],
          const SizedBox(height: 10),
          TextButton(
            onPressed: () => setState(() {
              _signUp = !_signUp;
              _error = '';
            }),
            child: Text(_signUp ? 'Already have an account? Log in' : 'New here? Create an account'),
          ),
        ],
      ),
    );
  }
}
