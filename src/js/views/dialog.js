/**
 * Task dialog view — the create/edit form.
 *
 * Card 7 of the rendering contract, and the only stateful view in the
 * application. Every other view is a pure function that returns a
 * subtree; the dialog manages its own internal state (the current value
 * of each input, which field has focus) and must NOT be re-rendered from
 * scratch on every keystroke. Re-rendering a form while the user types
 * would lose focus, cursor position, and undo history — the three things
 * a text input exists to preserve.
 *
 * The contract names this exception explicitly. A future contributor who
 * "simplifies" the dialog to match the other views would break the form,
 * and the contract's job is to make that breakage a violation, not a
 * reasonable-looking refactor.
 *
 * What the dialog owns:
 *   The `<dialog>` element and everything inside it. It is mounted on
 *   demand by the event layer (not rendered by the dashboard), and it
 *   is removed when the user cancels or submits. The dialog is not part
 *   of the dashboard's render tree, so its ownership does not appear in
 *   the DOM ownership map — it has no container to share.
 *
 * What the dialog does NOT do:
 *   - It does not validate. It surfaces validation errors the store
 *     throws, but the rules are the store's and the store's alone. A
 *     dialog that validated would be a second source of truth, and the
 *     two would disagree within a week.
 *   - It does not call the store directly. The form's submit handler is
 *     provided by the caller (the event layer); the dialog's job is to
 *     read the form and hand the values to whoever asked for them.
 *   - It does not manage persistence. It submits; the caller decides
 *     what to do with the submission.
 *
 * The dialog's lifecycle:
 *   1. Caller creates it via `createTaskDialog({ mode, task, onSubmit,
 *      onCancel })`.
 *   2. Caller mounts it in the document (typically `document.body`).
 *   3. The dialog shows itself via `dialog.showModal()`.
 *   4. The user fills the form and submits, or cancels, or closes the
 *      dialog (via the browser's Escape).
 *   5. The dialog calls `onSubmit` (with the form values) or `onCancel`,
 *      then closes itself, then is removed from the DOM by the caller
 *      (via the returned object's `destroy()`).
 *
 *   The `destroy()` call is important: a `<dialog>` that is closed but
 *   not removed from the DOM is a leak waiting for the next open to
 *   show a stale form. The event layer is expected to call `destroy()`
 *   when the dialog's promise resolves.
 *
 * Security:
 *   Every user-supplied string (task title, description, creator,
 *   assignee) is set via the input's `value` property, not via an
 *   attribute or innerHTML. `value` is treated as text by the browser,
 *   so a user who pastes `<script>alert(1)</script>` into the title
 *   input sees that text in the input and in the card that renders it.
 *   The dialog is not a place where user input is rendered as markup.
 *
 *   The dialog also does not trust its `task` argument. If a caller
 *   passes a hand-built task with a `title` that is not a string, the
 *   form renders empty rather than throwing. The dialog is defensive at
 *   the boundary where it meets caller data.
 *
 * @module views/dialog
 */

import { el, nextId } from '../utils/dom.js';
import { FIELDS, USER_FIELDS } from '../store/schema.js';

/**
 * Human-readable labels for the user-supplied fields.
 *
 * Declared here, not in the schema, because the label is a presentation
 * concern. A future localisation feature would move these to a
 * translation file; the schema would not change. Keeping labels out of
 * the schema also means a test that asserts "the schema has exactly the
 * documented fields" is not affected by a label change.
 */
const FIELD_LABELS = Object.freeze({
  title: 'Title',
  description: 'Description',
  creator: 'Creator',
  assignee: 'Assignee',
});

/**
 * Create the task dialog.
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
 * }}
 *
 * The return value is a controller object, not just the element. The
 * caller needs to:
 *   - mount the element (element),
 *   - open it (open),
 *   - close it programmatically (close),
 *   - remove it from the DOM (destroy),
 *   - show validation errors from the store (showErrors).
 *
 * The `onSubmit` callback receives the raw form values as strings. It
 * is the caller's job to decide what to do with them — typically, call
 * `store.create` or `store.update` and either close the dialog (on
 * success) or call `showErrors` (on `ValidationError`). The dialog does
 * not know about the store, so it cannot call it directly.
 */
export function createTaskDialog({ mode, task, onSubmit, onCancel }) {
  const isEdit = mode === 'edit' && task !== null && task !== undefined;
  const formId = nextId('task-dialog');
  const titleId = `${formId}-title`;
  const descriptionId = `${formId}-description`;
  const creatorId = `${formId}-creator`;
  const assigneeId = `${formId}-assignee`;

  // The form fields, in the order the schema declares them. The order
  // is: title, description, creator, assignee. This is the order the
  // store renders them in, and the order the user reads them in. A
  // future field would appear here automatically if the schema's
  // FIELD_NAMES is in the right order — but the dialog is explicit
  // about labels and inputs, so a future field is a visible change,
  // not a silent addition.
  const fieldIds = {
    title: titleId,
    description: descriptionId,
    creator: creatorId,
    assignee: assigneeId,
  };

  // Build each input. `value` is set from the task when editing, so a
  // user who opens the edit dialog sees the current values pre-filled.
  // The value is set as an attribute, not as `innerHTML` — the browser
  // treats attribute values as text in input elements, so a title like
  // `<img onerror=...>` renders as that literal string.
  const inputs = {
    title: el('input', {
      id: titleId,
      name: 'title',
      type: 'text',
      class: 'task-dialog__input',
      maxlength: String(FIELDS.title.maxLength),
      required: true,
      autocomplete: 'off',
      value: isEdit && typeof task.title === 'string' ? task.title : '',
    }),
    description: el('textarea', {
      id: descriptionId,
      name: 'description',
      class: 'task-dialog__input task-dialog__input--textarea',
      maxlength: String(FIELDS.description.maxLength),
      rows: '3',
      autocomplete: 'off',
    }, isEdit && typeof task.description === 'string' ? task.description : ''),
    creator: el('input', {
      id: creatorId,
      name: 'creator',
      type: 'text',
      class: 'task-dialog__input',
      maxlength: String(FIELDS.creator.maxLength),
      required: true,
      autocomplete: 'off',
      value: isEdit && typeof task.creator === 'string' ? task.creator : '',
    }),
    assignee: el('input', {
      id: assigneeId,
      name: 'assignee',
      type: 'text',
      class: 'task-dialog__input',
      maxlength: String(FIELDS.assignee.maxLength),
      required: true,
      autocomplete: 'off',
      value: isEdit && typeof task.assignee === 'string' ? task.assignee : '',
    }),
  };

  // Per-field error containers. The dialog shows errors *next to* the
  // field they belong to, not in a single list at the top. A user
  // looking for why the form will not submit sees the message where
  // they are looking.
  const errorNodes = {};
  for (const name of USER_FIELDS) {
    errorNodes[name] = el('p', {
      class: 'task-dialog__error',
      id: `${formId}-${name}-error`,
      role: 'alert',
      'aria-live': 'polite',
    });
  }

  // The form. The submit button is the primary action; the cancel
  // button is the secondary. Both are `<button type="...">` so that
  // pressing Enter in a field submits the form (the browser's default
  // for a form with a submit button) and pressing Escape closes the
  // dialog (the browser's default for a `<dialog>`).
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
      }, isEdit ? 'Save changes' : 'Create task'),
    ]),
  ]);

  const dialog = el('dialog', {
    class: 'task-dialog',
    dataset: { region: 'dialog', mode },
    'aria-labelledby': `${formId}-heading`,
  }, [
    el('h2', {
      id: `${formId}-heading`,
      class: 'task-dialog__heading',
    }, isEdit ? 'Edit task' : 'New task'),
    form,
  ]);

  // Read the current values from the form. Trimmed, so the dialog does
  // not send whitespace the user did not mean. The store trims again
  // (defence in depth), but sending trimmed values means the message
  // the user sees on validation ("must be at most 120 characters")
  // matches what they typed after trim — not the raw whitespace they
  // accidentally included.
  function readValues() {
    return {
      title: inputs.title.value.trim(),
      description: inputs.description.value.trim(),
      creator: inputs.creator.value.trim(),
      assignee: inputs.assignee.value.trim(),
    };
  }

  // Clear errors on every keystroke. A user who fixes a field should
  // not have to submit the form again just to clear the stale message.
  // The errors that come back from `showErrors` are re-applied until
  // the next submission, so clearing on input means: fix the field,
  // see the error clear, submit again, see it if still wrong.
  for (const name of USER_FIELDS) {
    inputs[name].addEventListener('input', () => {
      errorNodes[name].textContent = '';
    });
  }

  // The dialog's action handling. This is the one place a view attaches
  // listeners — and it is justified: the dialog is a single instance,
  // created once per open, destroyed on close, and the listeners are
  // attached to nodes the dialog itself owns. A list delegating is one
  // listener for many cards; a dialog wiring its own form is one
  // listener for one form. Different shapes, both correct.
  //
  // The submit handler calls `onSubmit` and awaits the result. If the
  // callback throws a ValidationError, the dialog does NOT catch it —
  // that is the caller's job, because the caller is the one that
  // knows about the store and the error types. The dialog's job is to
  // call the callback and let it decide what happens next (including
  // whether to call `showErrors` or close).
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await onSubmit(readValues());
  });

  // The cancel button calls `onCancel` and closes. Escape also closes
  // (the `<dialog>` browser default), and the `close` event fires in
  // both cases. The caller's `onCancel` is called from the `cancel`
  // button, not from the `close` event, because the `close` event
  // fires for submit too — and a submit is not a cancel.
  form.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action="cancel-dialog"]') : null;
    if (target) {
      event.preventDefault();
      close();
      if (typeof onCancel === 'function') onCancel();
    }
  });

  // The `<dialog>` `close` event fires when the browser closes it
  // (Escape, backdrop click in some browsers). The dialog does not
  // emit `onCancel` from that event — the caller decided to treat the
  // cancel button as the cancel action, and Escape as a "browser
  // closed it" (which the caller can treat the same or different).
  // Keeping the two distinct means the caller can log one and not the
  // other, or dismiss silently on Escape and confirm on cancel.

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
   * Show validation errors from the store.
   *
   * The store throws a `ValidationError` whose `fields` is a
   * `Record<string, string>` mapping field name to message. This
   * function writes each message into the error node next to the
   * field it belongs to, and focuses the first field with an error
   * so the user knows where to look.
   *
   * A field in `fields` that is not in `USER_FIELDS` (e.g. `_` for a
   * general error, or a forbidden field name) is written into the
   * first user field's error area — the most prominent position
   * available without inventing a new area. This is not ideal for a
   * general error, but the dialog's job is not to be an error
   * dashboard; it is to render the errors the store found, in the
   * places they can be read.
   *
   * The `aria-describedby` attribute is set on each input that has an
   * error, so a screen-reader user hears the message when they focus
   * the field. It is cleared on submit.
   */
  function showErrors(fields) {
    // Clear all errors first, so an old error for a now-fixed field
    // does not linger.
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
        // Errors for fields the dialog does not render (e.g. `_`,
        // or a forbidden field name) go into the first user field's
        // area, which is the most visible place the dialog has.
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
  };
}