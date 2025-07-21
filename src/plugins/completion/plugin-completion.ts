import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const completionPlugin = () => {

    return new Plugin({
    state: {
      init(_, { doc }) {
        return DecorationSet.empty;
      },
      apply(tr, oldDecorations, oldState, newState) {
        return;
        // Only update decorations if selection or doc changed
        if (tr.docChanged || tr.selectionSet) {
          const { $from } = newState.selection;
          if ($from) {
            const deco = Decoration.widget($from.pos, () => {
              const span = document.createElement("span");
              span.textContent = ".log('Hello World');";
              span.style.opacity = "0.5";
              span.style.pointerEvents = "none";
              span.style.userSelect = "none";
              return span;
            }, { side: 1 }); // show *after* the cursor
            return DecorationSet.create(newState.doc, [deco]);
          }
        }

        return oldDecorations;
      }
    },
    props: {
      decorations(state) {
        return this.getState(state);
      }
    }
  });


}