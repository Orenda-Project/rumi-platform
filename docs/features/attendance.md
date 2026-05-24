# ✅ Attendance

![Attendance](../images/features/attendance.jpg)

> Daily attendance without paper or a separate app — a quick tap-through on WhatsApp.

## What it is

Lightweight class attendance. A teacher sets up their class list once, then marks who's present each day through a native WhatsApp Flow (a tap-based form). Over time it becomes a simple, queryable attendance record.

## How it works

1. **Teacher sets up a class list** (once) via the attendance-setup WhatsApp Flow — class name, section, and students.
2. **Each day**, Rumi offers the marking Flow — tap to select who's absent/present.
3. **Rumi records** attendance against the class roster.
4. **Records accumulate** for later review and reporting.

## What the teacher experiences

A fast daily check-in: open the form, tap down the list, done — no separate login, no paper register to carry.

## Enable it

_Always on_ — core. The attendance setup and marking Flows are registered to your WhatsApp Business Account during setup (`register-all-flows`); their IDs land in `ATTENDANCE_SETUP_FLOW_ID` and `ATTENDANCE_MARKING_FLOW_ID`.

## Customize

Adjust the roster fields or marking flow — see the [attendance flow JSON](../../bot/docs/flows/) and the [Agent Customization Guide](../agent-customization.md).
