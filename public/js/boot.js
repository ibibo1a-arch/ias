'use strict';
// Boot — runs after all modules are loaded
restoreTab();
if (typeof restoreAccordionState === 'function') restoreAccordionState();
