# Product Specification

## Working Name

Subscription Manager

The name is temporary.

The product is an AI-powered manager for a user's personal information diet.

---

# Problem

People accumulate hundreds or thousands of subscriptions, follows, feeds, channels, podcasts, newsletters, and other sources over time.

The result is:

* information overload
* redundant content
* inactive subscriptions
* forgotten interests
* low-quality sources
* difficulty discovering what one is actually consuming
* difficulty deciding what to unsubscribe from

Existing feed readers help users consume information.

This product focuses on helping users understand and manage their information sources.

---

# Product Vision

> Give people an intelligent control panel for everything they choose to consume online.

The product should eventually answer:

* What am I following?
* What are my interests?
* Where is my attention going?
* Which sources are redundant?
* Which sources have become irrelevant?
* Which sources are high-value?
* What should I unsubscribe from?
* What should replace low-value sources?

---

# MVP

The MVP supports YouTube.

The user can:

1. Sign in.
2. Connect YouTube.
3. Import their YouTube subscriptions.
4. Browse their subscriptions.
5. Search subscriptions.
6. Filter by category.
7. View AI-generated descriptions.
8. View topics.
9. See AI recommendations.
10. Select multiple subscriptions.
11. Review selected subscriptions.
12. Bulk unsubscribe.
13. See which operations succeeded or failed.
14. View an action history.

---

# MVP Non-Goals

Do not implement these in the MVP:

* Facebook
* Instagram
* TikTok
* X
* Reddit
* Threads
* LinkedIn
* podcasts
* newsletters
* automated replacement subscriptions
* fully autonomous unsubscribe
* social posting
* content generation
* social analytics
* creator analytics
* monetization
* team accounts

The architecture should allow these later.

---

# Core User

The initial target user is an information-heavy internet user who follows many creators and sources.

Example:

A user follows:

* 80 YouTube channels
* 40 RSS feeds
* 20 Reddit communities
* 15 newsletters
* 10 podcasts

They know their subscriptions have become messy but don't know where to start cleaning them up.

---

# Core User Journey

## First Visit

User sees:

```
Your information diet

Connect a source to get started.

[ Connect YouTube ]
```

---

# Connect YouTube

User selects:

```
[ Connect YouTube ]
```

The application sends the user through Google OAuth.

After successful authorization:

```
Connected to YouTube

Importing subscriptions...
```

The application retrieves subscriptions and stores normalized source records.

---

# Subscription Dashboard

Example:

```
Your Sources

247 sources

[ Search sources... ]

All
Cooking
Woodworking
Technology
Programming
DIY
Gaming
Other

--------------------------------------------

□ Bourbon Moth Woodworking
  Woodworking · Furniture

  Furniture building, woodworking projects,
  shop builds and traditional joinery.

  AI recommendation: KEEP

□ Example Cooking Channel
  Cooking · Recipes

  Practical home cooking and recipe tutorials.

  AI recommendation: REVIEW
```

The exact visual design can evolve.

---

# Source

A source represents something the user consumes.

For the MVP, a source is a YouTube channel.

A source should have:

* name
* platform
* external ID
* URL
* image/thumbnail
* description
* category
* subcategory
* topics
* content metadata
* activity metadata
* AI enrichment
* AI recommendation

---

# Categories

Initial top-level taxonomy:

1. Cooking
2. Woodworking
3. DIY & Home Improvement
4. Technology
5. Programming
6. Business
7. Finance
8. News
9. Science
10. Education
11. Engineering
12. Fitness
13. Cycling
14. Travel
15. Automotive
16. Gaming
17. Music
18. Art & Design
19. Photography
20. Fashion
21. Lifestyle
22. Comedy
23. Entertainment
24. Sports
25. Other

The taxonomy should be stored/configured centrally.

Do not allow the AI to create new top-level categories.

---

# AI Source Enrichment

For each source, AI should produce:

* top-level category
* subcategory
* 3-8 topics
* concise description
* confidence

Example:

```
{
  "category": "Woodworking",
  "subcategory": "Furniture",
  "topics": [
    "joinery",
    "hardwood furniture",
    "hand tools"
  ],
  "description":
    "Creates traditional hardwood furniture and
     demonstrates joinery, hand tools, and shop projects.",
  "confidence": 0.94
}
```

The source description should describe the content, not the personality of the creator.

Avoid marketing language.

---

# AI Recommendation

The first recommendation system has three states:

```
KEEP
REVIEW
UNSUBSCRIBE
```

The AI should consider available evidence such as:

* recent activity
* user's engagement
* content topics
* category relevance
* content overlap
* source inactivity
* source frequency
* similarity to other sources

The recommendation must include a reason.

Example:

```
UNSUBSCRIBE

Reason:
You have not watched this channel in 11 months
and several other subscriptions provide similar
woodworking content.
```

AI recommendations are advisory.

The application must never automatically unsubscribe based solely on an AI recommendation.

---

# Bulk Unsubscribe

The user can select multiple sources.

Example:

```
7 sources selected

[ Unsubscribe ]
```

Before execution:

```
Unsubscribe from these 7 sources?

This will remove the selected YouTube
subscriptions from your account.

[ Cancel ] [ Confirm unsubscribe ]
```

After execution:

```
5 unsubscribed successfully
2 failed

[ Retry failed ]
```

The UI must not claim success for operations that failed.

---

# Search

Search should initially operate over:

* source name
* description
* category
* subcategory
* topics

Eventually search can support natural language.

Examples:

```
woodworking

traditional furniture

channels about Japanese cooking

programming channels I rarely watch
```

Natural-language search is not required for the initial MVP.

---

# Filtering

Initial filters:

* category
* recommendation
* platform
* activity
* search text

Future filters:

* last watched
* subscription age
* content frequency
* quality score
* similarity
* language

---

# Sorting

Initial sorting:

* name
* category
* recommendation
* newest subscription
* oldest subscription

Future:

* relevance
* activity
* AI score
* engagement
* content quality

---

# AI Cleanup

After the basic MVP works, introduce an AI cleanup view.

Example:

```
AI Cleanup

We analyzed 247 sources.

23 appear inactive
17 have substantial content overlap
11 appear unrelated to your current interests

[ Review recommendations ]
```

The user reviews recommendations individually or in groups.

---

# Future Natural Language Interface

Eventually the user should be able to type:

```
Clean up my subscriptions.

Show me everything related to woodworking.

Remove stale channels.

What am I following too much?

Find redundant cooking channels.

Keep my best 10 technology channels.

Show me channels I haven't watched in six months.
```

The natural-language interface should translate requests into safe, reviewable operations.

It should not directly execute destructive operations without confirmation.

---

# Future Platforms

Potential integrations:

* YouTube
* RSS
* Reddit
* Instagram
* Facebook
* TikTok
* X
* Threads
* LinkedIn
* podcasts
* newsletters
* Substack
* blogs

Each integration should implement the platform adapter abstraction.

---

# Important Product Constraint

Different platforms expose very different APIs and permissions.

The product must not promise identical functionality across platforms.

For each platform, capabilities should be explicit.

Example:

```
YouTube
  read subscriptions: yes
  unsubscribe: yes
  read content: yes

RSS
  read sources: yes
  unsubscribe: local only
  read content: yes

Platform X
  capabilities depend on API access
```

The UI should reflect actual capabilities.

---

# Privacy

This application deals with personal information-consumption patterns.

Treat subscription data as private user data.

The product should:

* minimize stored data
* avoid storing unnecessary content
* protect OAuth credentials
* provide clear account disconnection
* provide data deletion
* never sell user subscription data
* never expose one user's sources to another user

Privacy is a product feature, not merely an implementation detail.

---

# Success Criteria for MVP

The MVP is successful if a user can:

1. Connect YouTube.
2. See all imported subscriptions.
3. Understand what each subscription is about.
4. Find subscriptions by topic/category.
5. Select multiple low-value subscriptions.
6. Understand why the AI recommends removing them.
7. Safely unsubscribe from the selected channels.
8. Trust that the displayed result matches what actually happened on YouTube.

The product should feel substantially easier than manually reviewing a large YouTube subscription list.
