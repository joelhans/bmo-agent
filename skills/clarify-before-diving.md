---
name: clarify-before-diving
description: Patterns for asking clarifying questions early to avoid wasted investigation
triggers: [investigate, debug, why, broken, not working, doesn't work, issue, problem, fix]
---

# Clarify Before Diving

## When to use
- User reports something "doesn't work" or "didn't happen"
- Starting investigation of an unknown bug
- Task involves third-party services or environment-specific behavior

## Core Principle

**One clarifying question can save 10+ minutes of investigation.**

## The Pattern

### Data vs UX distinction

When user reports "X didn't happen":
1. **Ask first**: "Did you check [data source]? Is the data missing, or is it there but not visible?"
2. **Two root causes**: (a) generation failed → data missing, (b) UX failed → data exists but hidden

### Environment-specific behavior

When building features involving third-party services:
1. **Ask first**: "Does [service] work in your dev environment?" 
2. **Common blockers**: CORS, CSP, missing API keys, localhost restrictions

### Ambiguous requirements

When task could go multiple directions:
1. **Ask first**: "What's the goal? [Option A] or [Option B]?"
2. **Avoid**: Building Option A, then learning user wanted Option B

## Anti-Patterns

❌ Dive into code investigation without confirming what the user actually sees
❌ Build features assuming third-party services work locally
❌ Spend 20 minutes debugging before asking one clarifying question

## Examples

**Bad**: User says "reflections aren't saved." I investigate the save code path for 10 minutes.
**Good**: "Let me check — when you look at the session JSON file, is the reflection field empty, or does it have content that just didn't display?"

**Bad**: User asks to integrate PostHog. I build the full integration, then it fails on CORS.
**Good**: "Before I implement this, does PostHog work in your local dev environment, or do you use a dev override?"

## Checklist

Before deep investigation:
- [ ] Have I confirmed what the user actually observes?
- [ ] Have I clarified data vs UX (exists but hidden)?
- [ ] Have I asked about environment constraints?
- [ ] Could one question narrow the search space by 80%?
