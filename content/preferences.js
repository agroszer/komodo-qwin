// Namespace definition
if(typeof(ko) == "undefined") { var ko = {}; }
if(typeof(ko.extensions) == "undefined") { ko.extensions = {}; }
if(typeof(ko.extensions.qwin) == "undefined") { ko.extensions.qwin = {}; }
ko.extensions.qwin.prefsDlg = {};

/**
 * Qwin's preferences dialog JavaScript implementation
 */
(function() {

  /**
   * Contains array with ID of all elements of our prefspane
   * @type {array}
   */
  const PREFSPANE_ELMS_ID = [
                             "qwin-enable-completion-checkbox",
                             "qwin-prefwindow-position-menulist",
                             "qwin-prefwindow-display-menulist",
                             "qwin-show_views_groups-check",
                             "qwin-highlight_current-check",
                             "qwin-show_icons-check",
                             "qwin-show_web_pages-check",
                             "qwin-show_start_page-check",
                             "qwin-only_active_project-check",
                             "qwin-highlight_unsaved-check",
                             "qwin-highlight_unsaved_type-menulist",
                             "qwin-highlight_unsaved_type_color-picker",
                             "qwin-completion-minwordlength",
                             "qwin-completion-ignore-case",
                             "qwin-completion-speed",
                             "qwin-completion-look-history",
                             "qwin-completion-items",
                             "qwin-enable-clipboard-checkbox",
                             "qwin-clipboard-items",
                             ];



  /**
   * Getter for preferences service.
   * @type {Components.interfaces.nsIPrefService}
   */
  this.__defineGetter__("prefSrv",
      function() {
        return Components.classes["@mozilla.org/preferences-service;1"].
                getService(Components.interfaces.nsIPrefService).
                getBranch("extensions.qwin.");
      });

  /**
   * Getter for enableQwin preferences key.
   * @type {boolean}
   */
  this.__defineGetter__("enableQwin",
      function() { return this.prefSrv.getBoolPref("enableQwin"); });

  /**
   * Getter for enableCompletion preferences key.
   * @type {boolean}
   */
  this.__defineGetter__("enableCompletion",
      function() { return this.prefSrv.getBoolPref("enableCompletion"); });

  /**
   * Getter for enableCompletion preferences key.
   * @type {boolean}
   */
  this.__defineGetter__("enableClipboard",
      function() { return this.prefSrv.getBoolPref("enableClipboard"); });

  /**
   * Getter for pathsDisplay preferences key.
   * @type {string}
   */
  this.__defineGetter__("pathsDisplay",
      function() { return this.prefSrv.getCharPref("pathsDisplay"); });

  /**
   * Getter for pathsDisplayLength preferences key.
   * @type {integer}
   */
  this.__defineGetter__("pathsDisplayLength",
      function() { return this.prefSrv.getIntPref("pathsDisplayLength"); });

  /**
   * Setter for pathsDisplayLength preferences key.
   * @param aLength {integer}
   */
  this.__defineSetter__("pathsDisplayLength",
      function(aVal) { this.prefSrv.setIntPref("pathsDisplayLength", aVal); });



  /**
   * Fired when is main (and single) pane of Qwin's preferences dialog
   * loaded.
   */
  this.onPaneLoad = function()
  {
    this.updatePane();
  }; // end onPaneLoad()


  /**
   * Update prefspane
   */
  this.updatePane = function()
  {
    try {
      for(var i=0; i<PREFSPANE_ELMS_ID.length; i++) {
        var control = document.getElementById(PREFSPANE_ELMS_ID[i]);

        if(control) {
          if(this.enableQwin) {
            if(control.hasAttribute("disabled"))
              control.removeAttribute("disabled");
          } else {
            control.setAttribute("disabled", "true");
          }
        } else {
          Components.utils.reportError("Unable to get UI control with ID '" +
                                       PREFSPANE_ELMS_ID[i] + ".");
        }
      }

      this.updateDisplayPathsLengthElm();
    } catch(e) {
      Components.utils.reportError(e);
    }
  }; // end updatePane()


  /**
   * Updates input element for displayPathsLength preference key.
   * Fired after pane load and after every change of pathsDisplay
   * preference change.
   */
  this.updateDisplayPathsLengthElm = function()
  {
    var elm = document.getElementById("qwin-prefwindow-pathsLength");

    if(this.pathsDisplay == "last-few-chars") {
      if(elm.hasAttribute("disabled"))
        elm.removeAttribute("disabled");
    } else {
      elm.setAttribute("disabled", "true");
    }
  }; // end updateDisplayPathsLengthElm()


  /**
   * Fired when user click on highlightUnsaved checkbox.
   *
   * @param aElm {nsIDOMElement}
   */
  this.onHighlightUnsavedCheckClick = function(aElm)
  {
    if(!aElm) return;

    var elm1 = document.getElementById("qwin-highlight_unsaved_type-menulist");
    var elm2 = document.getElementById("qwin-highlight_unsaved_type_color-btn");

    if(aElm.checked) {
      if(elm1.hasAttribute("disabled")) elm1.removeAttribute("disabled");
      if(elm2.hasAttribute("disabled")) elm2.removeAttribute("disabled");
    } else {
      elm1.setAttribute("disabled", "true");
      elm1.setAttribute("disabled", "false");
    }
  }; // end onHighlightUnsavedCheckClick(aElm)


  /**
   * Fired when user changed selected highlight type for unsaved views.
   *
   * @param aValue {string}
   */
  this.onHighlightUnsavedTypeChange = function(aType)
  {
    var elm = document.getElementById("qwin-highlight_unsaved_type_color-btn");
    if(!elm) return;

    if(aType == "color")
      if(elm.hasAttribute("disabled")) elm.removeAttribute("disabled");
    else
      elm.setAttribute("disabled");
  }

}).apply(ko.extensions.qwin.prefsDlg);
