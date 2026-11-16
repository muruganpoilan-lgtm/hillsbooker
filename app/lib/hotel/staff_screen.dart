import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'hotel_common.dart';

// Staff: mark who turned up today, and keep each person's details and monthly pay.

class StaffSection extends StatefulWidget {
  final String propertyId;
  const StaffSection({super.key, required this.propertyId});

  @override
  State<StaffSection> createState() => _StaffSectionState();
}

class _StaffSectionState extends State<StaffSection> {
  bool _people = false; // false = attendance, true = the list of staff

  DateTime _day = today();
  List<Map<String, dynamic>> _marks = [];
  List<Map<String, dynamic>> _staff = [];
  bool _loading = true;
  String _error = '';

  final Set<String> _busy = <String>{};
  final Map<String, int> _seq = <String, int>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final a = await Api.get('/hotel/${widget.propertyId}/attendance', query: {'day': isoDate(_day)});
    final s = await Api.get('/hotel/${widget.propertyId}/staff');
    if (!mounted) return;
    if (!a.ok || !s.ok) {
      setState(() {
        _loading = false;
        _error = a.ok ? s.error : a.error;
      });
      return;
    }
    setState(() {
      _loading = false;
      _error = '';
      _marks = rowList(rowMap(a.data)['staff']);
      _staff = rowList(s.data);
    });
  }

  Future<void> _mark(Map<String, dynamic> row, String? status) async {
    final id = text(row['staff_id']);
    final mine = (_seq[id] ?? 0) + 1;
    setState(() {
      _seq[id] = mine;
      _busy.add(id);
      row['status'] = status;
    });
    final res = await Api.put('/hotel/${widget.propertyId}/attendance', body: {
      'day': isoDate(_day),
      'marks': [
        {'staff_id': id, 'status': status}
      ],
    });
    if (!mounted || _seq[id] != mine) return;
    setState(() => _busy.remove(id));
    if (!res.ok) {
      snack(context, res.error);
      await _load();
    }
  }

  Future<void> _markEveryone() async {
    final unmarked = _marks.where((m) => text(m['status']).isEmpty).toList();
    if (unmarked.isEmpty) {
      snack(context, 'Everyone is already marked for this day.');
      return;
    }
    final yes = await askYesNo(
      context,
      'Mark everyone present?',
      '${plural(unmarked.length, 'person')} not yet marked will be set to Present. You can change any of them after.',
      'Mark present',
    );
    if (!yes || !mounted) return;
    final res = await Api.put('/hotel/${widget.propertyId}/attendance', body: {
      'day': isoDate(_day),
      'marks': unmarked.map((m) => {'staff_id': text(m['staff_id']), 'status': 'present'}).toList(),
    });
    if (!mounted) return;
    if (!res.ok) {
      snack(context, res.error);
      return;
    }
    await _load();
  }

  Future<void> _staffSheet({Map<String, dynamic>? person}) async {
    final name = TextEditingController(text: text(person?['name']));
    final phone = TextEditingController(text: text(person?['phone']));
    final job = TextEditingController(text: text(person?['job']));
    final salary = TextEditingController(text: person == null ? '' : toNum(person['monthly_salary']).round().toString());
    final note = TextEditingController(text: text(person?['note']));
    DateTime? joined = tryDay(person?['joined_on']);
    DateTime? left = tryDay(person?['left_on']);
    bool active = person == null ? true : person['active'] != false;
    String error = '';

    final saved = await hotelSheet<bool>(
      context,
      person == null ? 'Add someone' : text(person['name']),
      (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: fieldDeco('Name')),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: TextField(controller: phone, keyboardType: TextInputType.phone, decoration: fieldDeco('Phone', hint: 'Optional')),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: job,
                  textCapitalization: TextCapitalization.words,
                  decoration: fieldDeco('Job', hint: 'Cook, cleaner…'),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            TextField(
              controller: salary,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: fieldDeco('Monthly salary ₹'),
            ),
            const SizedBox(height: 12),
            HDateField(label: 'Joined on', value: joined, onChanged: (d) => setSheet(() => joined = d)),
            if (person != null) ...[
              const SizedBox(height: 12),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                activeColor: C.green,
                value: active,
                title: const Text('Still working here'),
                subtitle: Text(active ? 'Shows up in attendance and salary' : 'Kept for the record only'),
                onChanged: (v) => setSheet(() {
                  active = v;
                  if (!v && left == null) left = today();
                  if (v) left = null;
                }),
              ),
              if (!active)
                HDateField(label: 'Last day', value: left, onChanged: (d) => setSheet(() => left = d)),
            ],
            const SizedBox(height: 12),
            TextField(controller: note, decoration: fieldDeco('Note', hint: 'Optional')),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error, style: const TextStyle(color: C.brick)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                if (name.text.trim().isEmpty) {
                  setSheet(() => error = 'Enter a name.');
                  return;
                }
                final pay = parseMoney(salary.text) ?? 0;
                if (pay < 0) {
                  setSheet(() => error = "The salary can't be less than zero.");
                  return;
                }
                final body = <String, dynamic>{
                  'name': name.text.trim(),
                  'phone': phone.text.trim().isEmpty ? null : phone.text.trim(),
                  'job': job.text.trim().isEmpty ? null : job.text.trim(),
                  'joined_on': joined == null ? null : isoDate(joined!),
                  'monthly_salary': moneyOut(pay),
                  'note': note.text.trim().isEmpty ? null : note.text.trim(),
                };
                if (person != null) {
                  body['active'] = active;
                  body['left_on'] = left == null ? null : isoDate(left!);
                }
                final res = person == null
                    ? await Api.post('/hotel/${widget.propertyId}/staff', body: body)
                    : await Api.patch('/hotel/staff/${person['id']}', body: body);
                if (!ctx2.mounted) return;
                if (!res.ok) {
                  setSheet(() => error = res.error);
                  return;
                }
                Navigator.of(ctx2).pop(true);
              },
              child: Text(person == null ? 'Add' : 'Save'),
            ),
            if (person != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  final yes = await askYesNo(
                    ctx2,
                    'Remove ${person['name']}?',
                    'Their attendance and salary records go too. To keep the records, switch off "Still working here" instead.',
                    'Remove',
                  );
                  if (!yes || !ctx2.mounted) return;
                  final res = await Api.delete('/hotel/staff/${person['id']}');
                  if (!ctx2.mounted) return;
                  if (!res.ok) {
                    setSheet(() => error = res.error);
                    return;
                  }
                  Navigator.of(ctx2).pop(true);
                },
                icon: const Icon(Icons.delete_outline, size: 18, color: C.brick),
                label: const Text('Remove', style: TextStyle(color: C.brick)),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: C.brick)),
              ),
            ],
          ]);
        },
      ),
    );

    name.dispose();
    phone.dispose();
    job.dispose();
    salary.dispose();
    note.dispose();
    if (saved == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: C.green));
    if (_error.isNotEmpty) {
      return ErrorBox(title: "We couldn't load your staff", message: _error, onRetry: _load);
    }

    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
        child: SizedBox(
          width: double.infinity,
          child: SegmentedButton<bool>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment<bool>(value: false, label: Text('Attendance')),
              ButtonSegment<bool>(value: true, label: Text('People')),
            ],
            selected: {_people},
            onSelectionChanged: (s) => setState(() => _people = s.first),
          ),
        ),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: _load,
          child: _people ? _peopleList() : _attendance(),
        ),
      ),
    ]);
  }

  Widget _attendance() {
    final marked = _marks.where((m) => text(m['status']).isNotEmpty).length;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
      children: [
        Row(children: [
          IconButton(
            tooltip: 'Previous day',
            icon: const Icon(Icons.chevron_left),
            onPressed: () async {
              setState(() {
                _day = _day.subtract(const Duration(days: 1));
                _loading = true;
              });
              await _load();
            },
          ),
          Expanded(
            child: Center(
              child: Column(children: [
                Text(prettyDayYear(_day), style: display(17)),
                if (isoDate(_day) == isoDate(today()))
                  const Text('Today', style: TextStyle(color: C.green, fontWeight: FontWeight.w700, fontSize: 12.5)),
              ]),
            ),
          ),
          IconButton(
            tooltip: 'Next day',
            icon: const Icon(Icons.chevron_right),
            onPressed: _day.isBefore(today())
                ? () async {
                    setState(() {
                      _day = _day.add(const Duration(days: 1));
                      _loading = true;
                    });
                    await _load();
                  }
                : null,
          ),
        ]),
        if (_marks.isEmpty)
          const HEmpty('Nobody to mark for this day. Add your staff under People first.')
        else ...[
          Text('$marked of ${_marks.length} marked', style: const TextStyle(color: C.soft, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          if (marked < _marks.length)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: OutlinedButton.icon(
                onPressed: _markEveryone,
                icon: const Icon(Icons.done_all, size: 18),
                label: const Text('Mark everyone present'),
              ),
            ),
          for (final m in _marks) _markCard(m),
        ],
      ],
    );
  }

  Widget _markCard(Map<String, dynamic> m) {
    final status = text(m['status']).isEmpty ? null : text(m['status']);
    final busy = _busy.contains(text(m['staff_id']));
    return HCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text(m['name']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
              if (text(m['job']).isNotEmpty)
                Text(text(m['job']), style: const TextStyle(color: C.soft, fontSize: 12.5)),
            ]),
          ),
          if (status != null)
            Pill(attendanceNames[status] ?? status, attendanceColor(status))
          else
            const Pill('Not marked', C.soft),
        ]),
        const SizedBox(height: 10),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final e in attendanceNames.entries)
              ChoiceChip(
                selected: status == e.key,
                onSelected: busy ? null : (_) => _mark(m, status == e.key ? null : e.key),
                label: Text(e.value),
                labelStyle: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                  color: status == e.key ? Colors.white : C.ink,
                ),
                selectedColor: attendanceColor(e.key),
                backgroundColor: Colors.white,
                showCheckmark: false,
                visualDensity: VisualDensity.compact,
                side: BorderSide(color: status == e.key ? attendanceColor(e.key) : C.line),
              ),
          ],
        ),
      ]),
    );
  }

  Widget _peopleList() {
    final working = _staff.where((s) => s['active'] != false).toList();
    final past = _staff.where((s) => s['active'] == false).toList();
    final payroll = working.fold<num>(0, (sum, s) => sum + toNum(s['monthly_salary']));

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
      children: [
        FilledButton.icon(
          onPressed: () => _staffSheet(),
          icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
          label: const Text('Add someone'),
        ),
        const SizedBox(height: 14),
        HTotals(children: [
          HLine('Working here', '${working.length}'),
          HLine('Monthly pay for all of them', money(payroll), strong: true),
        ]),
        const SizedBox(height: 6),
        if (_staff.isEmpty) const HEmpty('No staff yet. Add your cook, cleaner or anyone else on the payroll.'),
        for (final s in working) _personCard(s),
        if (past.isNotEmpty) ...[
          const SizedBox(height: 12),
          const HHeading('No longer working here'),
          for (final s in past) _personCard(s),
        ],
      ],
    );
  }

  Widget _personCard(Map<String, dynamic> s) {
    final gone = s['active'] == false;
    return HCard(
      onTap: () => _staffSheet(person: s),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(text(s['name']), style: display(16, color: gone ? C.soft : C.ink)),
            if (text(s['job']).isNotEmpty || text(s['phone']).isNotEmpty)
              Text(
                [text(s['job']), text(s['phone'])].where((x) => x.isNotEmpty).join(' · '),
                style: const TextStyle(color: C.soft, fontSize: 12.5),
              ),
            if (tryDay(s['joined_on']) != null)
              Text('Joined ${dayYearText(s['joined_on'])}', style: const TextStyle(color: C.soft, fontSize: 12)),
            if (gone && tryDay(s['left_on']) != null)
              Text('Left ${dayYearText(s['left_on'])}', style: const TextStyle(color: C.soft, fontSize: 12)),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(money(toNum(s['monthly_salary'])), style: const TextStyle(fontWeight: FontWeight.w800)),
          const Text('a month', style: TextStyle(color: C.soft, fontSize: 12)),
        ]),
        const Icon(Icons.chevron_right, color: C.soft),
      ]),
    );
  }
}
