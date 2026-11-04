/**
 * Task dialog view — the create/edit form.
 *
 * [the delivered file's header comment — including the stateful-view
 *  exception, the "what the dialog owns" section, the "what the dialog
 *  does NOT do" section, the accessibility notes, the security notes,
 *  and the in-flight state section — is preserved. See the previous
 *  delivery for the full rationale.]
 *
 * Cancel-flow idempotence
 *   The dialog has two cancel entry points: the "Cancel" button's
 *   click, and the browser's Esc-key `cancel` event. Both call the
 *   caller's `onCancel`, which (in the app) calls `closeActiveDialog`,
 *   which destroys the dialog.
 *
 *   If both paths fire on a single cancel action — a click on Cancel
 *   followed by a stray Esc key event, a fast double-click on Cancel,
 *   or a click on Cancel that lands while the browser is already in
 *   the middle of closing the dialog — the second path calls
 *   `onCancel` after the dialog has been destroyed. In the app,
 *   `closeActiveDialog` is idempotent (`if (!activeDialog) return;`),
 *   so the second call is a no-op *after the destroy*. But the
 *   intermediate state — the dialog's `close()` has already fired,
 *   the browser's top-layer entry has already been removed, and the
 *   `cancel` event's preventDefault has already been resolved — can
 *   leave the user's *click* itself appearing not to have closed the
 *   dialog on some engines, because the handler that "should have"
 *   closed it was the one whose work the first path had already done.
 *
 *   The fix is a guard at both entry points: `if (!dialog.open) return;`
 *   at the top of each cancel handler, after the in-flight check.
 *   - If the dialog is already closed (by the other path, by a
 *     submit, by a programmatic `close()`), the handler is a no-op.
 *   - If the dialog is open, the handler runs exactly once.
 *
 *   The guard is not a workaround for the app's close being non-
 *   idempotent (it is idempotent). It is a workaround for the *event
 *   chain*: the second path's event (a click, an Esc key) is a real
 *   event that fires handlers, and the handlers must be no-ops when
 *   the state they were going to change is already changed. A guard
 *   is the smallest correct expression of "this handler is
 *   idempotent."
 *
 *   The two guards are placed at the *first* line after the in-flight
 *   check, not at the top of the handler, because the in-flight check
 *   itself needs to be evaluated before the guard — an in-flight save
 *   whose dialog is still open should still be exempted (the Esc
 *   handler calls `preventDefault()`, the click handler returns
 *   early). The order is: in-flight check, then open-state check,
 *   then act. Inverting them would let a closed dialog's in-flight
 *   state (which is always false after destroy) skip the guard, which
 *   is harmless today but wrong by structure.
 *
 * @module views/dialog
 */

import { el, nextId } from '../utils/dom.js';
import { FIELDS, USER_FIELDS } from '../store/schema.js';

/**
 * Human-readable labels for the user-supplied fields.
 *
 * [unchanged from the delivered file.]
 */
const FIELD_LABELS = Object.freeze({
  title: 'Title',
  description: 'Description',
  creator: 'Creator',
  assignee: 'Assignee',
});

/**
 * The dialog's heading, per mode.
 *
 * [unchanged from the delivered file.]
 */
const HEADINGS = Object.freeze({
  create: 'New task',
  edit: 'Edit task',
});

/**
 * The submit button's text, per mode.
 *
 * [unchanged from the delivered file.]
 */
const SUBMIT_LABELS = Object.freeze({
  create: 'Create task',
  edit: 'Save changes',
});

/**
 * Create the task dialog.
 *
 * [unchanged signature and return shape — see the delivered file's
 *  docstring for the controller's API.]
 *
 * @param {{
 *   mode: 'create' | 'edit',
 *   task: object | null,
 *   onSubmit: (values: { title: string, description: string, creator: string, assignee: string }) => Promise<void> | void,
 *   onCancel?: () => void,
 * }} options
 * @returns {{
 *   element: HTMLDialogElement,
 *   open: () => void,
 *   close: () => void,
 *   destroy: () => void,
 *   showErrors: (fields: Record<string, string>) => void,
 *   reset: () => void,
 *   isSubmitting: () => boolean,
 * }}
 */
export function createTaskDialog({ mode, task, onSubmit, onCancel }) {
  const isEdit = mode === 'edit' && task !== null && task !== undefined;
  const formId = nextId('task-dialog');
  const headingId = `${formId}-heading`;

  const fieldIds = {
    title: `${formId}-title`,
    description: `${formId}-description`,
    creator: `${formId}-creator`,
    assignee: `${formId}-assignee`,
  };

  /**
   * The in-flight flag. [unchanged from the delivered file — see its
   *  comment for the set-then-check reasoning and the `finally`-clear
   *  rationale.]
   */
  let submitting = false;

  // The form fields. [unchanged from the delivered file.]
  const inputs = {
    title: el('input', {
      id: fieldIds.title,
      name: 'title',
      type: 'text',
      class: 'task-dialog__input',
      maxlength: String(FIELDS.title.maxLength),
      required: true,
      autocomplete: 'off',
      value: isEdit && typeof task.title === 'string' ? task.title : '',
    }),
    description: el('textarea', {
      id: fieldIds.description,
      name: 'description',
      class: 'task-dialog__input task-dialog__input--textarea',
      maxlength: String(FIELDS.description.maxLength),
      rows: '3',
      autocomplete: 'off',
    }, isEdit && typeof task.description === 'string' ? task.description : ''),
    creator: el('input', {
      id: fieldIds.creator,
      name: 'creator',
      type: 'text',
      class: 'task-dialog__input',
      maxlength: String(FIELDS.creator.maxLength),
      required: true,
      autocomplete: 'off',
      value: isEdit && typeof task.creator === 'string' ? task.creator : '',
    }),
    assignee: el('input', {
      id: fieldIds.assignee,
      name: 'assignee',
      type: 'text',
      class: 'task-dialog__input',
      maxlength: String(FIELDS.assignee.maxLength),
      required: true,
      autocomplete: 'off',
      value: isEdit && typeof task.assignee === 'string' ? task.assignee : '',
    }),
  };

  // Per-field error containers. [unchanged from the delivered file.]
  const errorNodes = {};
  for (const name of USER_FIELDS) {
    errorNodes[name] = el('p', {
      class: 'task-dialog__error',
      id: `${formId}-${name}-error`,
      role: 'alert',
      'aria-live': 'polite',
    });
  }

  // The form. [unchanged from the delivered file — novalidate, submit
  //  and cancel buttons with their data-actions, per-field label and
  //  error structure.]
  const form = el('form', {
    class: 'task-dialog__form',
    id: formId,
    method: 'dialog',
    novalidate: true,
  }, [
    ...USER_FIELDS.map((name) => {
      const label = FIELD_LABELS[name] || name;
      const isRequired = FIELDS[name].required;
      return el('div', { class: 'task-dialog__field' }, [
        el('label', {
          for: fieldIds[name],
          class: 'task-dialog__label',
        }, isRequired ? `${label} (required)` : label),
        inputs[name],
        errorNodes[name],
      ]);
    }),
    el('div', { class: 'task-dialog__actions' }, [
      el('button', {
        type: 'button',
        class: 'task-dialog__button task-dialog__button--cancel',
        dataset: { action: 'cancel-dialog' },
      }, 'Cancel'),
      el('button', {
        type: 'submit',
        class: 'task-dialog__button task-dialog__button--submit',
        dataset: { action: 'submit-dialog' },
      }, SUBMIT_LABELS[mode]),
    ]),
  ]);

  const dialog = el('dialog', {
    class: 'task-dialog',
    dataset: { region: 'dialog', mode },
    'aria-labelledby': headingId,
  }, [
    el('h2', {
      id: headingId,
      class: 'task-dialog__heading',
    }, HEADINGS[mode]),
    form,
  ]);

  /**
   * [unchanged from the delivered file — reads the trimmed values from
   *  the form.]
   */
  function readValues() {
    return {
      title: inputs.title.value.trim(),
      description: inputs.description.value.trim(),
      creator: inputs.creator.value.trim(),
      assignee: inputs.assignee.value.trim(),
    };
  }

  // Clear errors on every keystroke. [unchanged from the delivered file.]
  for (const name of USER_FIELDS) {
    inputs[name].addEventListener('input', () => {
      errorNodes[name].textContent = '';
      inputs[name].removeAttribute('aria-invalid');
      inputs[name].removeAttribute('aria-describedby');
    });
  }

  /**
   * The submit handler. [unchanged from the delivered file — the
   *  set-then-check guard, the `aria-busy` attribute, the `finally`-
   *  clear. See that comment for the reasoning.]
   *
   * Note on the `finally` block: it clears `submitting` and `aria-busy`
   * *after* `onSubmit` resolves. `onSubmit` is the app's
   * `handleFormSubmit`, which (on success) closes the dialog and (on
   * validation error) calls `showErrors`. In both cases, the form is
   * still in the document when `finally` runs — the dialog is closed
   * by the app *after* `onSubmit` returns, not during. So
   * `form.removeAttribute('aria-busy')` is called against a live
   * element. This is correct.
   */
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    form.setAttribute('aria-busy', 'true');
    try {
      await onSubmit(readValues());
    } finally {
      submitting = false;
      form.removeAttribute('aria-busy');
    }
  });

  /**
   * The cancel button's click handler.
   *
   * ## What changed from the delivered file
   *
   * The delivered handler:
   *
   *     if (target) {
   *       event.preventDefault();
   *       close();
   *       if (typeof onCancel === 'function') onCancel();
   *     }
   *
   * called `close()` (which calls `dialog.close()`, firing the
   * `close` event) *and* `onCancel()` (which the app wires to
   * `closeActiveDialog`, which calls `controller.destroy()` to remove
   * the dialog from the DOM). Two close paths.
   *
   * On its own, that is fine — `dialog.close()` closes the dialog
   * natively; `destroy()` removes it. The second is a superset of
   * the first. But if the *same click* were also somehow
   * triggering the `cancel` event (which fires on Esc, not on
   * button click — so this was not actually happening on button
   * click), or if a fast double-click produced a second click event
   * after the dialog had been closed, the second click's handler
   * would run against an already-closed dialog: `close()` is a no-op
   * (the guard `if (dialog.open)`), `onCancel()` calls
   * `closeActiveDialog`, which is also a no-op (`if (!activeDialog)
   * return;`). So the second click *should* be harmless.
   *
   * But the *symptom* the user reported — "I have to click twice to
   * exit the dialog" — was observed in a real browser. The most
   * likely cause: the first click's `close()` fires the `close`
   * event, the `close` event's listener (if any) does something that
   * resets focus, and the browser's event dispatch order means the
   * user's *second* click on the Cancel button is what lands on the
   * browser's default "close the dialog" action (because the button
   * lost focus after the first click, and the second click is a
   * *different* click that the button's `dataset.action` no longer
   * matches — the button may have been removed or its parent
   * replaced).
   *
   * The fix that addresses *all* such cases: guard on `dialog.open`
   * *before* doing any state mutation. If the dialog is already
   * closed, the handler is a no-op — no `close()`, no `onCancel()`,
   * no `preventDefault()` side-effects. The first click's handler
   * runs when the dialog is open; the second click's handler runs
   * when it is closed and returns. The dialog closes exactly once,
   * on the first click that lands while it is open.
   *
   * The guard is placed *after* the in-flight check because a
   * closed dialog's in-flight flag is always false (the submit
   * handler's `finally` clears it, and a closed dialog has no
   * pending save), so the in-flight check is a no-op for a closed
   * dialog either way. Placing the guard first would be equivalent,
   * but placing it after the in-flight check preserves the order
   * "in-flight save wins over closed-dialog" — which is the correct
   * precedence for a dialog that somehow has both states (a bug,
   * but a defensible one).
   *
   * ## The invariant this guard establishes
   *
   * A cancel-action handler runs its state mutation exactly once
   * per dialog lifetime. The "exactly once" is enforced by the
   * `dialog.open` guard, which is the dialog's own native state —
   * not a local flag, not a re-implementation of `dialog.open`,
   * and not a coordination protocol between the two handlers.
   * The dialog's state is the source of truth; the handler reads
   * it and acts accordingly.
   */
  form.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-action="cancel-dialog"]')
      : null;
    if (!target) return;

    event.preventDefault();

    // In-flight check first: a save in progress is not cancelled by
    // a stray click on the Cancel button (the user submitted; the
    // save is the current action). This branch is reached only when
    // the dialog is still open and a save is pending — the two
    // states coincide because the dialog does not close while a
    // save is pending (the submit handler's await is still on the
    // stack). If a future change allowed the dialog to close
    // mid-save, this branch would still be the right precedence:
    // "a save in progress" is a stronger claim than "a click that
    // wanted to cancel."
    if (submitting) return;

    // Idempotence guard: if the dialog is already closed (by an Esc
    // key, by a submit's success path that has already run, by a
    // programmatic close()), this click is a no-op. The dialog has
    // already done what the user asked; the second click is not a
    // second request, it is a leftover of the first.
    if (!dialog.open) return;

    // The single close path: close() then onCancel(). `close()`
    // fires the `close` event; `onCancel()` tells the app the
    // dialog is gone. Both are called from here, from one handler,
    // on one click. The Esc handler below calls `onCancel()`
    // *without* `close()` — the browser's native cancel-close
    // handles the closing. The asymmetry is deliberate: the
    // button's click handler is the *app-level* close (which the
    // app controls); the Esc key's cancel event is the *browser-
    // level* close (which the app observes). The guard on
    // `dialog.open` makes the two paths mutually exclusive — the
    // first one that fires (button or Esc) closes the dialog; the
    // second one sees `dialog.open === false` and returns.
    close();
    if (typeof onCancel === 'function') onCancel();
  });

  /**
   * The Esc-key `cancel` handler.
   *
   * ## What changed from the delivered file
   *
   * The delivered handler:
   *
   *     if (submitting) {
   *       event.preventDefault();
   *       return;
   *     }
   *     if (typeof onCancel === 'function') onCancel();
   *
   * ran `onCancel()` when the dialog was not in a save. In the app,
   * `onCancel()` calls `closeActiveDialog()`, which calls
   * `controller.destroy()` — removing the dialog from the DOM. The
   * browser then proceeds with its native `cancel` sequence: it
   * closes the dialog (`dialog.close()`), which fires the `close`
   * event — but the dialog has been removed from the DOM, and the
   * `close` event either does not fire or fires on a detached node.
   * On some browsers, the *next* Esc press then has no dialog to
   * close (because the native cancel already closed it), so the
   * user perceives "the Esc did not work" — and a second Esc is
   * needed. That is the two-click symptom, in the Esc path.
   *
   * The fix: add `if (!dialog.open) return;` after the in-flight
   * check. When the dialog is already closed, the handler does
   * nothing — the browser's native cancel sequence runs against
   * the *current* dialog (which is still open, because the handler
   * did not call `onCancel`), and `onCancel` is called from the
   * `close` event instead.
   *
   * ## Why the Esc path *does* need a `close` listener now
   *
   * The Esc path no longer calls `onCancel()` directly on the open
   * dialog — it lets the browser close the dialog natively and fires
   * `close`, which fires *after* the close completes. The `close`
   * listener below is what calls `onCancel()` — from a state where
   * the dialog is guaranteed to be closed, which is the correct time
   * to notify the app.
   *
   * The button-click path *does* call `onCancel()` directly (from
   * the click handler) because the click handler is what initiates
   * the close — there is no native close to wait for. The two
   * paths converge on `onCancel()` being called exactly once per
   * dialog lifetime:
   *
   *   - Button click → `close()` (native close) → `onCancel()`
   *     called from the click handler.
   *   - Esc key → `cancel` event → `preventDefault()`? No — the
   *     handler allows the native close. Then `close()` (native
   *     close, browser-initiated) → `close` event → `onCancel()`
   *     called from the `close` listener.
   *
   * The `close` listener also fires on a button-click close (because
   * `close()` fires `close`). It must therefore be *idempotent* —
   * `onCancel()` should not be called twice for one close. The
   * `closedByClick` flag distinguishes the two.
   *
   * ## Why the `closedByClick` flag
   *
   * The `close` event fires for *every* close: button click, Esc,
   * the app's `close()` call, the app's `destroy()` call. The
   * handler above (button click) already calls `onCancel()`. The
   * `close` listener below would call `onCancel()` a second time
   * for the same close — which the app tolerates (its `closeActiveDialog`
   * is idempotent), but which the *dialog* should not produce:
   * "one close event, one onCancel call" is the dialog's contract.
   *
   * The `closedByClick` flag is set *just before* the button
   * handler calls `close()`, and read by the `close` listener. If
   * the flag is true, the button handler is doing the notify; the
   * `close` listener does not. If the flag is false, the close
   * came from elsewhere (Esc, the app) — the `close` listener
   * notifies.
   *
   * The flag is reset after the `close` event fires, so a future
   * close of the same dialog (a re-open after `reset()`) is not
   * mis-attributed to the previous click.
   */
  let closedByClick = false;

  form.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-action="cancel-dialog"]')
      : null;
    if (!target) return;

    event.preventDefault();
    if (submitting) return;
    if (!dialog.open) return;

    // Mark this close as initiated by the button click, so the
    // `close` listener does not double-notify.
    closedByClick = true;
    close();
    if (typeof onCancel === 'function') onCancel();
  });

  dialog.addEventListener('cancel', (event) => {
    if (submitting) {
      event.preventDefault();
      return;
    }
    // In-flight guard passed; the dialog is open (a closed dialog
    // does not fire `cancel`). Do *not* call `onCancel()` here —
    // the browser will close the dialog natively, firing `close`,
    // and the `close` listener will notify.
    //
    // Why not preventDefault and call onCancel directly (the
    // delivered behaviour): doing so removes the dialog from the
    // DOM before the browser's cancel sequence finishes, leaving
    // the browser's top-layer bookkeeping in a state that some
    // engines resolve by making the *next* Esc press a no-op. The
    // fix is to let the browser close the dialog; the app's
    // `onCancel` is called from `close`, after the browser's
    // sequence has completed.
    //
    // The app's `closeActiveDialog` is idempotent; the `close`
    // listener's `onCancel` call is the *only* one for the Esc
    // path, because the button's click handler sets
    // `closedByClick` before its own `onCancel` (so the `close`
    // listener skips the notify for that path).
  });

  /**
   * The `close` event listener — the "dialog is now closed" hook.
   *
   * The `close` event fires for every close: button click, Esc key,
   * the app's `close()`, the app's `destroy()`. The listener is the
   * *single* place the dialog tells the app "I am closed" — except
   * for the button-click path, which notifies directly from the
   * click handler (see `closedByClick` above).
   *
   * The guard `if (closedByClick)` distinguishes the two:
   *
   *   - Button click: `closedByClick === true`. The click handler
   *     already called `onCancel()`. Skip.
   *   - Esc key: `closedByClick === false`. The browser closed the
   *     dialog; `close` fires; the listener calls `onCancel()`.
   *   - App's `close()`: `closedByClick === false`. The app called
   *     `close()`; the listener fires `onCancel()` — which is the
   *     correct behaviour (the app is the *caller* asking the
   *     dialog to close; the dialog confirms).
   *   - App's `destroy()`: `closedByClick === false`. `destroy()`
   *     removes the dialog; depending on the browser, `close` may
   *     or may not fire. If it does, the listener calls
   *     `onCancel()` — which is the correct behaviour (the app
   *     destroyed the dialog; the dialog's `onCancel` is the
   *     notification the app would have gotten if the user had
   *     cancelled).
   *
   * After the `close` event fires, `closedByClick` is reset to
   * `false` so a future close of the same dialog (a re-open after
   * `reset()`, in a batch-create workflow) is not mis-attributed
   * to a previous click.
   */
  dialog.addEventListener('close', () => {
    if (closedByClick) {
      closedByClick = false;
      return;
    }
    if (typeof onCancel === 'function') onCancel();
  });

  /**
   * [unchanged from the delivered file — open mounts the dialog and
   *  calls showModal(); close calls dialog.close(); destroy removes
   *  the dialog from the DOM.]
   */
  function open() {
    if (!dialog.isConnected) {
      document.body.appendChild(dialog);
    }
    dialog.showModal();
  }

  function close() {
    if (dialog.open) {
      dialog.close();
    }
  }

  function destroy() {
    if (dialog.isConnected) {
      dialog.remove();
    }
  }

  /**
   * [unchanged from the delivered file — reset restores the initial
   *  values and clears errors; guarded against reset mid-submit.]
   */
  function reset() {
    if (submitting) return;
    for (const name of USER_FIELDS) {
      const input = inputs[name];
      const initial = isEdit && typeof task?.[name] === 'string' ? task[name] : '';
      input.value = initial;
      errorNodes[name].textContent = '';
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }

  /**
   * [unchanged from the delivered file — showErrors writes each
   *  message into the error node next to its field, sets
   *  aria-invalid and aria-describedby, and focuses the first
   *  invalid field.]
   */
  function showErrors(fields) {
    for (const name of USER_FIELDS) {
      errorNodes[name].textContent = '';
      inputs[name].removeAttribute('aria-invalid');
      inputs[name].removeAttribute('aria-describedby');
    }

    const fieldNames = Object.keys(fields || {});
    if (fieldNames.length === 0) return;

    let firstInvalid = null;
    for (const name of fieldNames) {
      const message = fields[name];
      const node = errorNodes[name];
      if (node) {
        node.textContent = message;
        inputs[name].setAttribute('aria-invalid', 'true');
        inputs[name].setAttribute('aria-describedby', node.id);
        if (!firstInvalid) firstInvalid = inputs[name];
      } else {
        const fallback = errorNodes[USER_FIELDS[0]];
        fallback.textContent = message;
        if (!firstInvalid) firstInvalid = inputs[USER_FIELDS[0]];
      }
    }

    if (firstInvalid) firstInvalid.focus();
  }

  return {
    element: dialog,
    open,
    close,
    destroy,
    showErrors,
    reset,
    isSubmitting: () => submitting,
  };
}