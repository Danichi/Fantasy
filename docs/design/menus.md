# The book (menus)

Every menu is a page of one book (`ui/menuBook.ts`). It opens from the BOOK button in the corner or from any page's key.

| Tab | Sub-tabs (key) |
|---|---|
| Character (I) | Gear & Bag (I), Stats |
| Skills (K) | Disciplines (K), Attributes, Mastery, Herbal (O), Seamanship (N) |
| Journal (J) | Quests (J), People (P) |
| Map (M) | |

- **One frame:** the book is a single oak frame with the tabs across its top and the sub-tabs beneath. Every page sits in the same content area, at the same size and in the same place.
- **What's hidden:** while a page is in the book, its own title, close button, inner tab row and key hints are hidden. The book's header says those once.
- **Remembering:** a tab reopens on the sub-page you last left it on.
- **One page at a time:** a page opened by its own key replaces the one showing.
- **What shows through:**
  - Behind most pages the game is dimmed.
  - The Character page and the Map are not dimmed: the character preview is drawn on the game canvas beneath its window, and the map has its own backdrop.
- **Quieter cards:** long descriptions on the Seamanship and Herbal cards are clamped to two lines until you point at them.

Each screen still builds its own page (inventory, skills, journal...). A `BookSub` tells the book:
- how to open it, close it and check whether it's open;
- which element to seat in the frame.
