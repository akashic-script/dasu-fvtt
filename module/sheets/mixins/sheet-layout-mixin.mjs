/**
 * Mixin that assembles the sidebar + tab-body + sheet-body DOM wrapper
 * structure shared by all DASU sheets on first render.
 *
 * @param {typeof foundry.applications.api.DocumentSheetV2} Base
 */
export const SheetLayoutMixin = (Base) =>
  class SheetLayout extends Base {
    /** @override */
    _onFirstRender(context, options) {
      super._onFirstRender(context, options);
      this.#buildLayout();
    }

    #buildLayout() {
      const sidebar = this.element.querySelector('.sheet-sidebar');
      const tabNav = this.element.querySelector('nav.tabs');
      if (!sidebar || !tabNav) return;

      const tabSections = [
        ...this.element.querySelectorAll('.tab[data-group="primary"]'),
      ];
      const tabBody = document.createElement('div');
      tabBody.classList.add('tab-body');
      tabSections[0]?.before(tabBody);
      tabSections.forEach((s) => tabBody.append(s));
      tabBody.prepend(tabNav);

      const mainContent = document.createElement('div');
      mainContent.classList.add('main-content');
      sidebar.after(mainContent);
      mainContent.append(sidebar, tabBody);

      const sheetBody = document.createElement('div');
      sheetBody.classList.add('sheet-body');
      mainContent.after(sheetBody);
      sheetBody.append(mainContent);
    }
  };
