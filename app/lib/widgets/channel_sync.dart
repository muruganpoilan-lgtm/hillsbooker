import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import 'common.dart';

const _sites = ['Airbnb', 'Booking.com', 'Agoda', 'MakeMyTrip', 'Goibibo', 'Expedia', 'Other'];

/// Channel manager for one room: our calendar link for other sites, and the links we read from them.
class ChannelSync extends StatefulWidget {
  const ChannelSync({super.key, required this.roomId});

  final String roomId;

  @override
  State<ChannelSync> createState() => _ChannelSyncState();
}

class _ChannelSyncState extends State<ChannelSync> {
  Map<String, dynamic>? _d;
  String _site = 'Airbnb';
  final _url = TextEditingController();
  String _busy = '';
  String _error = '';
  String _ok = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  String get _base => '/owner/room-types/${widget.roomId}/channels';

  List<Map<String, dynamic>> get _feeds => ((_d?['feeds'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  Future<void> _load() async {
    final res = await Api.get(_base);
    if (!mounted || !res.ok) return;
    setState(() => _d = Map<String, dynamic>.from(res.data as Map));
  }

  String _when(dynamic ts) {
    final t = DateTime.tryParse('${ts ?? ''}');
    if (t == null) return 'not read yet';
    final mins = DateTime.now().difference(t).inMinutes;
    if (mins < 1) return 'just now';
    if (mins < 60) return '$mins min ago';
    if (mins < 1440) return '${mins ~/ 60} h ago';
    return '${t.toLocal().day}/${t.toLocal().month}';
  }

  Future<void> _add() async {
    setState(() {
      _error = '';
      _ok = '';
    });
    if (_url.text.trim().isEmpty) {
      setState(() => _error = 'Paste the calendar link from the other site.');
      return;
    }
    setState(() => _busy = 'add');
    final res = await Api.post(_base, body: {'name': _site, 'url': _url.text.trim()});
    if (!mounted) return;
    setState(() => _busy = '');
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    _url.clear();
    final data = res.data as Map;
    setState(() {
      if (data['status'] == 'error') {
        _error = "Saved, but we couldn't read it: ${data['error']}";
      } else {
        _ok = 'Connected. Nights taken on that site are now blocked here.';
      }
    });
    _load();
  }

  Future<void> _sync(String id) async {
    setState(() => _busy = id);
    final res = await Api.post('/owner/channels/$id/sync');
    if (!mounted) return;
    setState(() {
      _busy = '';
      if (!res.ok) {
        _error = res.error;
        _ok = '';
      } else if (res.data['status'] == 'error') {
        _error = '${res.data['error']}';
        _ok = '';
      } else {
        _error = '';
        _ok = 'Up to date.';
      }
    });
    _load();
  }

  Future<void> _remove(Map<String, dynamic> f) async {
    final yes = await askYesNo(context, 'Disconnect ${f['name']}?', 'Nights it blocked will open again here.', 'Disconnect');
    if (!yes || !mounted) return;
    setState(() => _busy = '${f['id']}');
    final res = await Api.delete('/owner/channels/${f['id']}');
    if (!mounted) return;
    setState(() => _busy = '');
    if (!res.ok) snack(context, res.error);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Other booking sites', style: display(18)),
      const SizedBox(height: 4),
      const Text(
        'Connect Airbnb, Booking.com and others so a room booked on one site is blocked on the rest. Sites share calendars through links. Changes can take a few hours to show on the other site.',
        style: TextStyle(color: C.soft, fontSize: 13.5),
      ),
      if (d != null) ...[
        const SizedBox(height: 14),
        const Text('1. Give this link to the other site', style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        const Text('Paste it where the site asks to import or sync a calendar. It lists the nights this room is sold out.', style: TextStyle(color: C.soft, fontSize: 13.5)),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(child: SelectableText('${d['export_url']}', style: const TextStyle(fontSize: 12.5))),
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: '${d['export_url']}'));
              if (mounted) snack(context, 'Link copied');
            },
            child: const Text('Copy'),
          ),
        ]),
        const Text('Keep this link private. Anyone with it can see which nights are sold out.', style: TextStyle(color: C.soft, fontSize: 13)),
        const SizedBox(height: 16),
        const Text("2. Add the other site's link here", style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          value: _site,
          decoration: const InputDecoration(labelText: 'Site'),
          items: [for (final s in _sites) DropdownMenuItem(value: s, child: Text(s))],
          onChanged: (v) => setState(() => _site = v ?? _site),
        ),
        const SizedBox(height: 10),
        TextField(controller: _url, autocorrect: false, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Calendar link (iCal)', hintText: 'https://…')),
        const SizedBox(height: 10),
        Align(alignment: Alignment.centerLeft, child: FilledButton(onPressed: _busy == 'add' ? null : _add, child: Text(_busy == 'add' ? 'Connecting…' : 'Connect'))),
        if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error, style: const TextStyle(color: C.brick, fontWeight: FontWeight.w700))),
        if (_ok.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_ok, style: const TextStyle(color: C.green, fontWeight: FontWeight.w700))),
        for (final f in _feeds)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(8)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${f['name']}', style: display(16)),
              const SizedBox(height: 2),
              Text(
                'Read ${_when(f['last_synced_at'])}${f['last_status'] == 'ok' ? ' · ${plural(toNum(f['events']).toInt(), 'night')} blocked' : ''}',
                style: const TextStyle(color: C.soft),
              ),
              if (f['last_status'] == 'error') Text('${f['last_error']}', style: const TextStyle(color: C.brick, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Row(children: [
                OutlinedButton(onPressed: _busy == '${f['id']}' ? null : () => _sync('${f['id']}'), child: const Text('Read now')),
                const SizedBox(width: 10),
                OutlinedButton(
                  onPressed: _busy == '${f['id']}' ? null : () => _remove(f),
                  style: OutlinedButton.styleFrom(foregroundColor: C.brick, side: const BorderSide(color: C.brick, width: 1.8)),
                  child: const Text('Disconnect'),
                ),
              ]),
            ]),
          ),
        const SizedBox(height: 10),
        const Text(
          'Airbnb: Calendar, Availability, Connect calendars. Booking.com: Rates and Availability, Sync calendars. Other sites: look for "iCal" or "calendar sync".',
          style: TextStyle(color: C.soft, fontSize: 13),
        ),
      ],
    ]);
  }
}
