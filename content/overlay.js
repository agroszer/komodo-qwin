/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Qwin extension.
 *
 * The Initial Developer of the Original Code is Ondrej Donek.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Ondrej Donek, <ondrejd@gmail.com> (Original Author)
 *   Adam Groszer, <agroszer@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

xtk.include("clipboard");

// taken from http://xregexp.com/xregexp.js
RegExp.escape = function(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}
function qwinFixedSizeStack(maxItems) {
    this.items = new Array();
    this.maxItems = maxItems ? maxItems : 100;
}

qwinFixedSizeStack.prototype = {
    push : function(item) {
        if (this.items.length >= this.maxItems) {
            this.items.splice(0, 1);
        }
        this.items.push(item);
    },

    pop : function() {
        return this.items.pop();
    },

    peek : function() {
        return this.items[this.items.length - 1];
    },

    get length() {
        return this.items.length;
    },

    clear : function() {
        this.items.splice(0, this.items.length);
    },

    resize : function(newSize) {
        this.maxItems = newSize;
    },

    remove : function(idx) {
        this.items.splice(idx, 1);
    },

    toString : function() {
        var arr = new Array();
        for (var i = 0; i < this.items.length; i++) {
            arr.push(i + ":" + this.items[i]);
        }
        return arr.join("\n");
    }
}

function qwinHash()
  {
      this.length = 0;
      this.items = new Array();
      for (var i = 0; i < arguments.length; i += 2) {
          if (typeof(arguments[i + 1]) != 'undefined') {
              this.items[arguments[i]] = arguments[i + 1];
              this.length++;
          }
      }

      this.removeItem = function(in_key)
      {
          var tmp_value;
          if (typeof(this.items[in_key]) != 'undefined') {
              this.length--;
              var tmp_value = this.items[in_key];
              delete this.items[in_key];
          }

          return tmp_value;
      }

      this.getItem = function(in_key) {
          return this.items[in_key];
      }

      this.setItem = function(in_key, in_value)
      {
          if (typeof(in_value) != 'undefined') {
              if (typeof(this.items[in_key]) == 'undefined') {
                  this.length++;
              }

              this.items[in_key] = in_value;
          }

          return in_value;
      }

      this.hasItem = function(in_key)
      {
          return typeof(this.items[in_key]) != 'undefined';
      }
  }


// Namespace definition
if(typeof(ko) == "undefined") { var ko = {}; }
if(typeof(ko.extensions) == "undefined") { ko.extensions = {}; }
ko.extensions.qwin = {};

/**
 * Qwin JavaScript implementation
 */
(function() {
  // Constants defining where to open Qwin sidebar
  const QWIN_WHERE_LEFT              = "left";
  const QWIN_WHERE_RIGHT             = "right";

  // Constants defining how to display view names in sidebar's tree
  const QWIN_DISPLAY_FILENAMES_ONLY  = "file-name-only";
  const QWIN_DISPLAY_LAST_FEW_CHARS  = "last-few-chars";
  const QWIN_DISPLAY_FULL_PATHS      = "full-paths";

  // Default count of chars when QWIN_DISPLAY_LAST_FEW_CHARS is used
  const QWIN_DISPLAY_COUNT_OF_CHARS  = 25;

  //completion constants, to be made preferences
  const QWIN_MAX_COMPLETION_ITEMS = 12;

  //filesize limit -- long files just lock up
  const QWIN_FILESIZELIMIT = 1024*1024;

  // Some variables
  var log          = ko.logging.getLogger("ko.extensions.qwin");
  var observerSvc  = Components.classes["@mozilla.org/observer-service;1"].
                     getService(Components.interfaces.nsIObserverService);


  //last word being completed
  var completionWord = null;

  //last inserted text
  var lastInsertedWord = null;

  //last completion positon (used for timer)
  var lastCompletionPos = '';
  var lastCompletionPosAt = null;

  //completion positon being shown on the treelist
  var completionsShown = '';
  var completionsShownAt = null;

  //completion timer
  var completionTimer = null;

  var clipboardHistory = null;
  var lastClipboardHistoryText = '';
  var clipboardHistoryCounter = 0;
  var clipboardTimer = null;

  const QWIN_CLIPBOARD_HISTORY_LRU = false;
  const QWIN_SEPARATORS = ' ./:';

  var version = 6;


  // ========================================================================
  // Preferences

  var prefSrv = Components.classes["@mozilla.org/preferences-service;1"].
      getService(Components.interfaces.nsIPrefService).
      getBranch("extensions.qwin.");

  this.prefs =
  {
    // Getters/Setters
    get enableQwin() { return prefSrv.getBoolPref("enableQwin"); },
    set enableQwin(val) { prefSrv.setBoolPref("enableQwin", val); },

    get enableCompletion() { return prefSrv.getBoolPref("enableCompletion"); },
    set enableCompletion(val) { prefSrv.setBoolPref("enableCompletion", val); },

    get enableClipboard() { return prefSrv.getBoolPref("enableClipboard"); },
    set enableClipboard(val) { prefSrv.setBoolPref("enableClipboard", val); },

    get displayWhere() { return prefSrv.getCharPref("displayWhere"); },
    set displayWhere(val) { prefSrv.setCharPref("displayWhere", val); },

    get pathsDisplay() { return prefSrv.getCharPref("pathsDisplay"); },
    set pathsDisplay(val) { prefSrv.setCharPref("pathsDisplay", val); },

    get pathsDisplayLength() { return prefSrv.getIntPref("pathsDisplayLength"); },
    set pathsDisplayLength(val) { prefSrv.setIntPref("pathsDisplayLength", val); },

    get highlightCurrent() { return prefSrv.getBoolPref("highlightCurrent"); },
    set highlightCurrent(val) { prefSrv.setBoolPref("highlightCurrent", val); },

    get showIcons() { return prefSrv.getBoolPref("showIcons"); },
    set showIcons(val) { prefSrv.setBoolPref("showIcons", val); },

    get showWebPages() { return prefSrv.getBoolPref("showWebPages"); },
    set showWebPages(val) { prefSrv.setBoolPref("showWebPages", val); },

    get showStartPage() { return prefSrv.getBoolPref("showStartPage"); },
    set showStartPage(val) { prefSrv.setBoolPref("showStartPage", val); },

    get showOnlyActiveProject() { return prefSrv.getBoolPref("showActiveProjectOnly"); },
    set showOnlyActiveProject(val) { prefSrv.setBoolPref("showActiveProjectOnly", val); },

    get showViewsGroups() { return prefSrv.getBoolPref("showViewsGroups"); },
    set showViewsGroups(val) { return prefSrv.setBoolPref("showViewsGroups", val); },

    get highlightUnsaved() { return prefSrv.getBoolPref("highlightUnsaved"); },
    set highlightUnsaved(val) { return prefSrv.setBoolPref("highlightUnsaved", val); },

    get highlightUnsavedType() { return prefSrv.getCharPref("highlightUnsavedType"); },
    set highlightUnsavedType(val) { return prefSrv.setCharPref("highlightUnsavedType", val); },


    get completionMinWordLength() { return prefSrv.getIntPref("completionMinWordLength"); },
    set completionMinWordLength(val) { return prefSrv.setIntPref("completionMinWordLength", val); },

    get completionIgnoreCase() { return prefSrv.getBoolPref("completionIgnoreCase"); },
    set completionIgnoreCase(val) { return prefSrv.setBoolPref("completionIgnoreCase", val); },

    get completionSpeed() { return prefSrv.getIntPref("completionSpeed"); },
    set completionSpeed(val) { return prefSrv.setIntPref("completionSpeed", val); },

    get completionItems() { return prefSrv.getIntPref("completionItems"); },
    set completionItems(val) { return prefSrv.setIntPref("completionItems", val); },

    get completionLookHistory() { return prefSrv.getBoolPref("completionLookHistory"); },
    set completionLookHistory(val) { return prefSrv.setBoolPref("completionLookHistory", val); },

    get clipboardItems() { return prefSrv.getIntPref("clipboardItems"); },
    set clipboardItems(val) { return prefSrv.setIntPref("clipboardItems", val); },


    /**
     * Set preferences if not exist (Qwin is running for first time).
     * Called from this.onLoad()
     */
    checkPrefs : function()
    {
      try {
        if(!prefSrv.prefHasUserValue("enableQwin"))
          prefSrv.setBoolPref("enableQwin", true);

        if(!prefSrv.prefHasUserValue("enableCompletion"))
          prefSrv.setBoolPref("enableCompletion", true);

        if(!prefSrv.prefHasUserValue("enableClipboard"))
          prefSrv.setBoolPref("enableClipboard", true);

        if(!prefSrv.prefHasUserValue("displayWhere"))
          prefSrv.setCharPref("displayWhere", QWIN_WHERE_LEFT);

        if(!prefSrv.prefHasUserValue("pathsDisplay"))
          prefSrv.setCharPref("pathsDisplay", QWIN_DISPLAY_FILENAMES_ONLY);

        if(!prefSrv.prefHasUserValue("pathsDisplayLength"))
          prefSrv.setIntPref("pathsDisplayLength", QWIN_DISPLAY_COUNT_OF_CHARS);

        if(!prefSrv.prefHasUserValue("highlightCurrent"))
          prefSrv.setBoolPref("highlightCurrent", true);

        if(!prefSrv.prefHasUserValue("showIcons"))
          prefSrv.setBoolPref("showIcons", true);

        if(!prefSrv.prefHasUserValue("showWebPages"))
          prefSrv.setBoolPref("showWebPages", true);

        if(!prefSrv.prefHasUserValue("showStartPage"))
          prefSrv.setBoolPref("showStartPage", true);

        if(!prefSrv.prefHasUserValue("showActiveProjectOnly"))
          prefSrv.setBoolPref("showActiveProjectOnly", false);

        if(!prefSrv.prefHasUserValue("showViewsGroups"))
          prefSrv.setBoolPref("showViewsGroups", true);

        if(!prefSrv.prefHasUserValue("highlightUnsaved"))
          prefSrv.setBoolPref("highlightUnsaved", true);

        if(!prefSrv.prefHasUserValue("highlightUnsavedType"))
          prefSrv.setCharPref("highlightUnsavedType", "asterix");



        if(!prefSrv.prefHasUserValue("completionMinWordLength"))
          prefSrv.setIntPref("completionMinWordLength", 3);

        if(!prefSrv.prefHasUserValue("completionIgnoreCase"))
          prefSrv.setBoolPref("completionIgnoreCase", false);

        if(!prefSrv.prefHasUserValue("completionSpeed"))
          prefSrv.setIntPref("completionSpeed", 100);

        if(!prefSrv.prefHasUserValue("completionItems"))
          prefSrv.setIntPref("completionItems", QWIN_MAX_COMPLETION_ITEMS);

        if(!prefSrv.prefHasUserValue("completionLookHistory"))
          prefSrv.setBoolPref("completionLookHistory", false);

        if(!prefSrv.prefHasUserValue("clipboardItems"))
          prefSrv.setIntPref("clipboardItems", QWIN_MAX_COMPLETION_ITEMS);

      } catch (e) {
          log.exception(e);
      }


    } // end checkPrefs()
  };


  // ========================================================================


  /**
   * Prototype object for single Qwin's treeitem
   *
   * @param aIndex {integer}
   * @param aLabel {string}
   * @param aFullPath {string}
   * @param aBaseName {string}
   * @param aIsDirty {boolean}
   * @param aType {string}
   */
  function QwinTreeitemPrototype(aIndex, aLabel, aFullPath, aBaseName,
                                 aIsDirty, aType, current)
  {
    this.index    = ko.extensions.qwin.indexMaker(aIndex);
    this.label    = aLabel;
    this.fullPath = aFullPath;
    this.baseName = aBaseName;
    this.isDirty  = aIsDirty;
    this.type     = aType;
    this.current  = current;
  };

  function QwinClipboardItemPrototype(text, usageCount, addIndex, current)
  {
    this.text       = text;
    this.usageCount = usageCount;
    this.addIndex   = addIndex;
    this.current    = current;
  };


  /**
   * Helper prototype object for tree sorting
   *
   * @type Object
   */
  var QwinTreesortHelper = {
    /**
     * Contains name of currently sorted column.
     * @type {string}
     */
    mCol : "",

    /**
     * Holds sort direction: -1 is descending, 0 is natural, 1 is ascending.
     * Meaned as private.
     * @type {integer}
     */
    mDirection : 0,

    /**
     * Returns string representing currently used direction
     * @param {string}
     */
    get mDirectionStr(){ return (this.mDirection == 1) ? "ascending" : "descending"; },

    /**
     * Holds count of tree items to examine if tree's row count is changed from
     * last sort (if we can use simple array reverse).
     * @type {integer}
     */
    mFastIndex : 0,

    /**
     * Method for performing sorting.
     * @param {object}
     * @param {object}
     * @returns {integer}
     */
    sort : function(aX, aY) {
      var isIndex = (this.mCol.indexOf("-tree-position-col") > 0) ? true : false;
      var x = (isIndex) ? parseInt(aX.index) : aX.label;
      var y = (isIndex) ? parseInt(aY.index) : aY.label;

      if(x > y) return 1;
      if(x < y) return -1;

      return 0;
    }
  };

  //this.doTest = function() {
  //  this.getAllOpenDocumentViews();
  //}

  //viewManager.topView.viewhistory._recentViews

  this.getAllOpenDocumentViews = function() {
        try {
            var views = [];
            var windows = ko.windowManager.getWindows();

            for (var i in windows) {
                var w = windows[i];

                //var arr = w.ko.views.manager.topView.getDocumentViews(true);

                //this one should be in recently used order:
                arr = w.ko.views.manager.topView.viewhistory._recentViews;
                for (var j in arr) {
                    var view = arr[j];
                    try {
                        if (view != null && view.scimoz != null) {
                            views.push(view.scimoz);
                        }
                    }
                    catch (e) {
                        //just in case there's no scimoz attr, skip this
                    }
                }
            }
        } catch (e) {
            log.exception(e);
        }
        return views;
    }

  //this.getWord = function() {
  //    try {
  //        var sm = ko.views.manager.currentView.scimoz;
  //        var curinsert = sm.currentPos;
  //        var lineno = sm.lineFromPosition(curinsert);
  //        var startofLinePos = sm.positionFromLine(lineno);
  //        var line = sm.getTextRange(startofLinePos, curinsert);
  //        var lastChar = line.charAt(line.length - 1);
  //        var append = '';
  //        if (QWIN_SEPARATORS.indexOf(lastChar) > -1) {
  //          append = lastChar;
  //          line = line.substr(0, line.length - 1);
  //        };
  //
  //        var myregexp = new RegExp("(\\w*)$", "gm");
  //        var words = line.match(myregexp);
  //        if (words) {
  //          return words[0] + append;
  //        } else {
  //          return '';
  //        }
  //    } catch (e) {
  //        log.exception(e);
  //    }
  //    return '';
  //}

  this.getWord = function() {
      try {
          var sm = ko.views.manager.currentView.scimoz;
          var curinsert = sm.currentPos;
          var lineno = sm.lineFromPosition(curinsert);
          var startofLinePos = sm.positionFromLine(lineno);
          var line = sm.getTextRange(startofLinePos, curinsert);

          var ml = ko.extensions.qwin.prefs.completionMinWordLength;
          if (QWIN_SEPARATORS) {
            var myregexp = new RegExp("(\\w+["+QWIN_SEPARATORS+"]?\\w{0,"+(ml-1)+"})$", "gm");
            var words = line.match(myregexp);
            if (words) {
              return words[0];
            };
          };

          var myregexp = new RegExp("(\\w{"+ml+",})$", "gm");
          var words = line.match(myregexp);
          if (words) {
            return words[0];
          } else {
            return '';
          };
      } catch (e) {
          log.exception(e);
      }
      return '';
  }

  this.getCompletion = function(completionIgnoreCase, curpos) {
    var rv = new Array();

    try {
        timeSvc = Components.classes["@activestate.com/koTime;1"].
            getService(Components.interfaces.koITime);

        var startTime = timeSvc.time();

        var word = ko.extensions.qwin.getWord();
        var fullword = ko.interpolate.getWordUnderCursor();

        if (word.length < ko.extensions.qwin.prefs.completionMinWordLength) {
            ko.extensions.qwin.completionWord = '';
            return rv;
            }

        ko.extensions.qwin.completionWord = word;

        if (completionIgnoreCase) {
          var options = "gim";
        } else {
          var options = "gm";
        }

        word = RegExp.escape(word);
        var myregexp = new RegExp("\\b" + word + "\\w+\\b", options);

        var sm = ko.views.manager.currentView.scimoz;
        var maxItems = ko.extensions.qwin.prefs.completionItems;

        words = new qwinHash();

        function addWord(w) {
            if ((w != "") && (!words.hasItem(w)) && w != fullword) {
                words.setItem(w,1);
            }
        }

        // maybe use myregexp.exec
        if (sm.textLength < QWIN_FILESIZELIMIT) {
            var wbefore = sm.getTextRange(0, sm.currentPos).match(myregexp);

            if (wbefore) {
                for (i=wbefore.length-1;
                     (i>=0 && words.items.length < maxItems);
                     i--) {
                    addWord(wbefore[i]);
                };
            };

            if (words.items.length < maxItems) {
                var wafter = sm.getTextRange(sm.currentPos, sm.textLength).match(myregexp);

                if (wafter) {
                    for (i=0;
                         (i<wafter.length && words.items.length < maxItems);
                         i++) {
                        addWord(wafter[i]);
                    }
                };
            };
        };

        //half of the timer setting -- plenty to do left
        var maxTime = (ko.extensions.qwin.prefs.completionSpeed / 1000)/2;

        if (words.items.length < maxItems
            && ko.extensions.qwin.prefs.completionLookHistory) {

            var views = this.getAllOpenDocumentViews();

            //alert(views);

            for (var i in views) {
                var viewScimoz = views[i];

                var duration = timeSvc.time() - startTime;
                //time limited lookup

                if (words.items.length < maxItems
                    && duration < maxTime //time limit
                    && viewScimoz.textLength < QWIN_FILESIZELIMIT //length limit at 1MB
                    ) {
                    //no break in JS???

                    var viewMatches = viewScimoz.text.match(myregexp);

                    if (viewMatches) {
                        for (i=0;
                            (i<viewMatches.length && words.items.length < maxItems);
                            i++) {
                            addWord(viewMatches[i]);
                        };
                    };
                }
            }
        }

        var index = 1;
        for (var x in words.items) {
            rv.push(new QwinTreeitemPrototype(index,
                                              x,
                                              x,
                                              '',
                                              false,
                                              '',
                                              false));
            index++;
            if (index > maxItems) break;
        }


        // see how much time is spent in a lookup:
        var duration = timeSvc.time() - startTime;
        if (duration > maxTime) {
          var msg = "getCompletion for "+word+" in "+duration+" at "+curpos;
          log.warn(msg);
        };

    }
    catch(e)
    {
        log.exception(e);
    }

    return rv;
  }

  /**
   * Common tree view prototype object. As a parameter is expected used
   * tree view items.
   *
   * @param aTreeitems {array}
   */
  function QwinTreeviewPrototype(aTreeitems) {
    this.treeitems = aTreeitems;
  };
  QwinTreeviewPrototype.prototype =
  {
    treebox   : null,
    selection : null,

    get rowCount() { return this.treeitems.length; },

    get idPrefix() {
      return "qwin-" + ko.extensions.qwin.prefs.displayWhere + "-tree";
    },

    get atomSrv() {
      return Components.classes["@mozilla.org/atom-service;1"].
          getService(Components.interfaces.nsIAtomService);
    },

    setTree : function(aOut) {
      this.treebox = aOut;
    },

    getCellText : function(aRow, aCol)
    {
      if (aCol.id.indexOf('col-index') > 0)
        return this.treeitems[aRow].index;

      if (aCol.id.indexOf('col-label') > 0) {
        if (ko.extensions.qwin.prefs.showIcons) {
          return " " + this.treeitems[aRow].label;
        } else {
          return this.treeitems[aRow].label;
        }
      }

      return "";
    },

    getCellValue : function(aRow, aCol)
    {
      return this.treeitems[aRow].fullPath;
    },

    get currentSelectedItem() {
        if (this.selection.currentIndex < 0) {
            return null;
        }
        return this.treeitems[this.selection.currentIndex];
    },

    getCellProperties : function(aRow, aCol, aProp)
    {
      //log.warn(this.treeitems[aRow]+this.treeitems[aRow].current);

      if(this.treeitems[aRow].current) {
        aProp.AppendElement(this.atomSrv.getAtom("currentView"));
      } else {
        if(ko.extensions.qwin.prefs.highlightCurrent) {
          var currentView = ko.views.manager.currentView;

          if(currentView.koDoc.displayPath == this.treeitems[aRow].fullPath)
            aProp.AppendElement(this.atomSrv.getAtom("currentView"));
        }
      }

      if(this.treeitems[aRow].isDirty &&
         ko.extensions.qwin.prefs.highlightUnsaved)
      {
        aProp.AppendElement(this.atomSrv.getAtom("isDirty"));
      }
    },

    getImageSrc : function(aRow, aCol)
    {
      var src = null;

      if(ko.extensions.qwin.prefs.showIcons &&
         (aCol.id.indexOf('col-label') > 0))
      {
        switch(this.treeitems[aRow].type)
        {
          case "browser":
            src = "chrome://famfamfamsilk/skin/icons/page_world.png";
            break;

          case "editor":
            src = "chrome://famfamfamsilk/skin/icons/page.png";
            break;

          case "startpage":
            src = "chrome://qwin/skin/openkomodo.png";
            break;
        }
      }

      return src;
    },

    hasNextSibling : function(aRow, aAfterIndex)
    {
      return ((aRow+1)<this.rowCount);
    },

    cycleHeader : function(aCol) {},

    /*cycleHeader : function(aCol)
    //sorting does not work???
    {
      var tree   = document.getElementById(this.idPrefix);
      var index  = tree.currentIndex;

      if(aCol.id == QwinTreesortHelper.mCol)
        QwinTreesortHelper.mDirection = (QwinTreesortHelper.mDirection == 0)
            ? 1
            : -QwinTreesortHelper.mDirection;

      if(aCol.id == QwinTreesortHelper.mSortedCol &&
         this.rowCount == QwinTreesortHelper.mFastIndex)
      {
        this.treeitems.reverse();
      }
      else
      {
        if(QwinTreesortHelper.mSortedCol !== "") {
          var old = document.getElementById(QwinTreesortHelper.mSortedCol);
          if(old) old.setAttribute("sortDirection", "");
        }

        QwinTreesortHelper.mSortedCol = aCol.id;
        this.treeitems.sort(QwinTreesortHelper.sort);
      }

      aCol.element.setAttribute("sortDirection",
                                QwinTreesortHelper.mDirectionStr);
      this.treebox.invalidate();

      if(index >= 0) {
        this.selection.select(index);
        this.treebox.ensureRowIsVisible(index);
      }

      QwinTreesortHelper.mFastIndex = this.rowCount;
    },*/

    isSorted : function() {
      return (QwinTreesortHelper.mDirection != 0) ? true : false;
    },

    // Other (mainly unused) methods
    getParentIndex : function(aRow) { return -1; },
    getLevel : function(aRow) { return 0; },
    getColumnProperties : function(aCol, aProp) { return; },
    getRowProperties : function(aRow, aProp) { return; },
    isContainer : function(aRow) { return false; },
    isContainerOpen : function(aRow) { return false; },
    isContainerEmpty : function(aRow) { return; },
    canDrop : function(aRow, aOrientation) { return true; },
    drop : function(aRow, aOrientation) {},
    toggleOpenState : function(aRow) {},
    selectionChanged : function() {},
    cycleCell : function(aRow, aCol) {},
    isEditable : function(aRow, aCol) { return false; },
    setCellText : function(aRow, aCol, aValue) {},
    setCellValue : function(aRow, aCol, aValue) {},
    performAction : function(aAction) {},
    performActionOnRow : function(aAction, aRow) {},
    preformActionOnCell : function(aAction, aRow, aCol) {},
    isSeparator : function(aRow) { return false; }

  }; // End of QwinTreeviewPrototype()


  // ========================================================================
  // Main methods for Qwin


  /**
   * Fired when Qwin is loading
   *
   */
  this.onLoad = function()
  {
    try {
      ko.extensions.qwin.determineKomodoVersion();

      // We have default values for all values so user doesn't
      // need to go to the Preferences dialog and set up them firstly.
      ko.extensions.qwin.prefs.checkPrefs();

      // Update Qwin's UI
      this.update(ko.extensions.qwin.prefs.displayWhere);
      this.updateClipboard(ko.extensions.qwin.prefs.displayWhere);

      // Append event observers
      observerSvc.addObserver(this, "open_file", false);
      observerSvc.addObserver(this, "open-url", false);
      observerSvc.addObserver(this, "SciMoz:FileDrop", false);
      observerSvc.addObserver(this, "file_changed", false);

      window.addEventListener('current_view_changed', this.update, false);
      window.addEventListener('view_closed', this.update, false);
      window.addEventListener('view_opened', this.update, false);

      // Append preferences observer
      prefSrv.QueryInterface(Components.interfaces.nsIPrefBranch2);
      prefSrv.addObserver("", this, false);

      ko.extensions.qwin.completionTimer = new ko.objectTimer(
        ko.extensions.qwin, ko.extensions.qwin.onTimer, []);
      // XXX
      ko.extensions.qwin.completionTimer.startInterval(
                                    ko.extensions.qwin.prefs.completionSpeed);

      //why is this needed???
      ko.extensions.qwin.clipboardHistory = new qwinFixedSizeStack(
                                    ko.extensions.qwin.prefs.clipboardItems);
      ko.extensions.qwin.clipboardHistoryCounter = 0;
      ko.extensions.qwin.lastClipboardHistoryText = '';

      ko.extensions.qwin.clipboardTimer = new ko.objectTimer(
        ko.extensions.qwin, ko.extensions.qwin.onClipboardTimer, []);
      // XXX
      ko.extensions.qwin.clipboardTimer.startInterval(250);

      // Add numbers to tabs
      // we do that always for now
      this.addTabNumberHandler();
    } catch(e) {
      log.exception(e);
    }
  }; // end onLoad()


  /**
   * Correctly unload Qwin (events obervers). Fired when Komodo is going to
   * be closed.
   */
  this.shutdown = function()
  {
    try {
      this.removeTabNumberHandler();

      if (ko.extensions.qwin.completionTimer) {
        ko.extensions.qwin.completionTimer.stopInterval();
        ko.extensions.qwin.completionTimer.free();
        ko.extensions.qwin.completionTimer = null;
      }

      if (ko.extensions.qwin.clipboardTimer) {
        ko.extensions.qwin.clipboardTimer.stopInterval();
        ko.extensions.qwin.clipboardTimer.free();
        ko.extensions.qwin.clipboardTimer = null;
      }

      observerSvc.removeObserver(this, "open_file");
      observerSvc.removeObserver(this, "open-url");
      observerSvc.removeObserver(this, "SciMoz:FileDrop");
      observerSvc.removeObserver(this, "file_changed");

      window.removeEventListener('current_view_changed', this.updateEvent, false);
      window.removeEventListener('view_closed', this.updateEvent, false);
      window.removeEventListener('view_opened', this.updateEvent, false);

      prefSrv.QueryInterface(Components.interfaces.nsIPrefBranch2);

      if(prefSrv)
        prefSrv.removeObserver("", this);
    } catch(e) {
      log.exception(e);
    }

    observerSvc = null;
  }; // end shutdown()


  /**
   * Observer implementation. We observe changes in views (opening, closing).
   *
   * @param aSubject {string}
   * @param aTopic {string}
   * @param aData {string}
   */
  this.observe = function(aSubject, aTopic, aData)
  {
    try {
      if (!ko.extensions.qwin.prefs.enableQwin) return;

      switch(aTopic) {
        case "open_file":
        case "SciMoz:FileDrop":
        case "file_changed":
        case "nsPref:changed":
          this.update();
          break;
      }
    } catch(e) {
      log.exception(e);
    }
  }; // end observe()

  this.determineKomodoVersion = function()
  {
    try {
      var vb=document.getElementById("qwinViewbox");
      if (!vb) {
        ko.extensions.qwin.version = 6;
      } else {
        ko.extensions.qwin.version = 7;
      };
    } catch(e) {
      log.exception(e);
    }
  };


  ko.extensions.qwin.getElement_6 = function(name)
  {
    var tree=null;
    try {
      var prefix = ko.extensions.qwin.prefs.displayWhere;
      tree       = document.getElementById("qwin-" + prefix + "-" + name);
    } catch(e) {
      log.exception(e);
    }
    return tree;
  };

  ko.extensions.qwin.getElement_7 = function(name)
  {
    var tree=null;
    try {
      // cache later
      tree       = document.getElementById("qwinViewbox").contentDocument.getElementById("qwin-left-"+name);
    } catch(e) {
      log.exception(e);
    }
    return tree;
  };

  //ko.extensions.qwin.getElement = function(name)
  //{
  //  try {
  //    if (ko.extensions.qwin.version == 6) {
  //      return ko.extensions.qwin.getElement_6()
  //    } else {
  //      return ko.extensions.qwin.getElement_7()
  //    }
  //  } catch(e) {
  //    log.exception(e);
  //  }
  //};

  ko.extensions.qwin.getElement = function(name)
  {
    var tree=null;
    try {
      //log.error('version:'+ko.extensions.qwin.version);

      if (ko.extensions.qwin.version == 6) {
        return ko.extensions.qwin.getElement_6(name)
      } else {
        return ko.extensions.qwin.getElement_7(name)
      }

      // cache later
      var vb=document.getElementById("qwinViewbox");
      if (!vb) {
        var prefix = ko.extensions.qwin.prefs.displayWhere;
        tree       = document.getElementById("qwin-" + prefix + "-" + name);
      } else {
        tree=vb.contentDocument.getElementById("qwin-left-"+name);
      };
    } catch(e) {
      log.exception(e);
    }
    return tree;
  };

  this.updateEvent = function()
  {
    try {
      if (!ko.extensions.qwin.prefs.enableQwin) return;

      this.update();
    } catch(e) {
      log.exception(e);
    }
  };

  this.indexMaker = function(index)
  {
    try {
      if (index <= 10) {
        return index;
      } else {
        // a11
        // b12
        return String.fromCharCode(index-11+97) + index;
      }
    } catch(e) {
      log.exception(e);
    }
    return index;
  };

  /**
   * Add handler patch to display numbers in tabs
   *
   */

  this.addTabNumberHandler = function()
  {
      try {
          var vm = ko.views.manager.topView;
          var box = document.getAnonymousNodes(vm)[0];

          // get the views-tabbed elements
          var tabset1 = box.firstChild;
          var tabset2 = box.lastChild;

          // replace the updateLeafName implementation to use something different
          // for the tab label
          tabset1._qwin_updateLeafName = tabset1.updateLeafName;
          tabset2._qwin_updateLeafName = tabset2.updateLeafName;

          tabset1.updateLeafName =
          tabset2.updateLeafName = function(view) {
              this._qwin_updateLeafName(view);
              try {
                  index = view._qwin_index
                  view.parentNode._tab.label = index+":"+view.parentNode._tab.label;
              } catch(e) {}
          };

          // make sure tab headers are updated
          var views = ko.views.manager.topView.getViews(true);
          for (var i=0; i < views.length; i++) {
              if (views[i].document) {
                  views[i].updateLeafName(views[i]);
              }
          }
      } catch(e) {
          log.exception(e);
      }
  }


  /**
   * Remove handler patch to display numbers in tabs
   *
   */

  this.removeTabNumberHandler = function()
  {
      try {
          var vm = ko.views.manager.topView;
          var box = document.getAnonymousNodes(vm)[0];

          // get the views-tabbed elements
          var tabset1 = box.firstChild;
          var tabset2 = box.lastChild;

          // replace back the updateLeafName implementation
          tabset1.updateLeafName = tabset1._qwin_updateLeafName;
          tabset2.updateLeafName = tabset2._qwin_updateLeafName;
      } catch(e) {
          log.exception(e);
      }
  }


  /**
   * Returns array of paths of opened documents
   *
   * @return {array}
   */
  this.getOpenedDocumentsPaths = function()
  {
    var treeitems = new Array();

    if(ko.extensions.qwin.prefs.showViewsGroups) {
      // XXX Get all views groups and make root treeitems from them
    }

    // XXX Show only views of active project
    var current_project = (ko.extensions.qwin.prefs.showOnlyActiveProject)
        ? ko.projects.active
        : null;

    try {
        //ko.windowManager.getMainWindow();
      var views = ko.views.manager.topView.getDocumentViewList(true);
      var index = 1;

      for(var i=0; i<views.length; i++)
      {
        var view = views[i];


        //freaking nasty solution, but works
        view._qwin_index = index;
        view.updateLeafName(view);



        var viewtype = view.getAttribute("type");

        if(typeof(view.koDoc) == "undefined" || !view.koDoc)
            continue;

        // Check if user want to see Start Page and browsers
        if(!ko.extensions.qwin.prefs.showWebPages && viewtype == "browser")
            continue;
        if(!ko.extensions.qwin.prefs.showStartPage && viewtype == "startpage")
            continue;

        // Create new treeitem
        var fullpath = "*** Untitled ***"
        var basename = "*** Untitled ***"
        var label    = "*** Untitled ***";
        var dirty    = true;
        var level    = 0;

        if(!view.koDoc.isUntitled) {
          fullpath = view.koDoc.displayPath;
          basename = view.koDoc.baseName;
          label    = "";
          dirty    = view.koDoc.isDirty;
          level    = 0;

          if(viewtype == "startpage") {
            label = "Start Page";
          } else {
            switch(ko.extensions.qwin.prefs.pathsDisplay) {
              case QWIN_DISPLAY_FILENAMES_ONLY:
                label = basename;
                break;

              case QWIN_DISPLAY_LAST_FEW_CHARS:
                var dl = ko.extensions.qwin.prefs.pathsDisplayLength;
                if (fullpath.length > dl) {
                    //label = "..." + fullpath.substring(fullpath.length - dl,
                    //                                   fullpath.length);
                    label = "…" + fullpath.substring(fullpath.length - dl,
                                                       fullpath.length);
                } else {
                    label = fullpath;
                }
                break;

              case QWIN_DISPLAY_FULL_PATHS:
                label = fullpath;
                break;
            }

            if(dirty && ko.extensions.qwin.prefs.higlightUnsaved)
              if(ko.extensions.qwin.prefs.higlightUnsavedType == "asterix")
                label = label + " *";
          }
        }

        treeitems.push(new QwinTreeitemPrototype(index,
                                                 label,
                                                 fullpath,
                                                 basename,
                                                 dirty,
                                                 viewtype,
                                                 false));

        index++;
      }
    } catch(e) {
      log.exception(e);
    }

    return treeitems;
  }; // end getOpenedDocumentsPaths()


  /**
   * Updates Qwin - user preferences and the tree
   */
  this.update = function()
  {
    try {
      //var prefix    = ko.extensions.qwin.prefs.displayWhere;
      var tree      = ko.extensions.qwin.getElement("tree");
      //var tree      = document.getElementById("qwin-" + prefix + "-tree");

      if (ko.extensions.qwin.version == 6) {
        var left_tab  = document.getElementById("qwin_left_tab");
        var right_tab = document.getElementById("qwin_right_tab");

        if(ko.extensions.qwin.prefs.displayWhere == "left") {
          if(left_tab.hasAttribute("collapsed"))
            left_tab.removeAttribute("collapsed");

          right_tab.setAttribute("collapsed", true);
        } else {
          if(right_tab.hasAttribute("collapsed"))
            right_tab.removeAttribute("collapsed");

          left_tab.setAttribute("collapsed", true);
        }
      }

      // Enable/disable Qwin according to user's preferences
      if (ko.extensions.qwin.prefs.enableQwin) {
        tree.disabled = false;
        ko.extensions.qwin.reloadTree();
      } else {
        // When Qwin is disabled we need to ensure that table is empty
        tree.view = new QwinTreeviewPrototype([]);
        tree.disabled = true;
      }

      //var completiontree = document.getElementById("qwin-" + prefix + "-completiontree");
      var completiontree = ko.extensions.qwin.getElement("completiontree")

      // Enable/disable Qwin according to user's preferences
      if (ko.extensions.qwin.prefs.enableCompletion) {
        completiontree.disabled = false;
        ko.extensions.qwin.reloadCompletionTree(
            null, ko.extensions.qwin.prefs.completionIgnoreCase, false);
      } else {
        // When Qwin is disabled we need to ensure that table is empty
        completiontree.view = new QwinTreeviewPrototype([]);
        completiontree.disabled = true;
      }

    } catch(e) {
      log.exception(e);
    }
  }; // end update()

  this.updateClipboard = function()
  {
    try {
      //var prefix    = ko.extensions.qwin.prefs.displayWhere;
      //var clipboardtree = document.getElementById("qwin-" + prefix + "-clipboardtree");
      var clipboardtree = ko.extensions.qwin.getElement("clipboardtree")

      // Enable/disable Qwin according to user's preferences
      if (ko.extensions.qwin.prefs.enableClipboard) {
        clipboardtree.disabled = false;
        ko.extensions.qwin.reloadClipboardTree();
      } else {
        // When Qwin is disabled we need to ensure that table is empty
        clipboardtree.view = new QwinTreeviewPrototype([]);
        clipboardtree.disabled = true;
      }

    } catch(e) {
      log.exception(e);
    }
  }; // end updateClipboard()

  /**
   * Fired whenever we need to reload our tree
   */
  this.reloadTree = function()
  {
    try {
        //var prefix = ko.extensions.qwin.prefs.displayWhere;
        //var tree   = document.getElementById("qwin-" + prefix + "-tree");
        var tree   = ko.extensions.qwin.getElement("tree");
        var paths  = this.getOpenedDocumentsPaths();

        tree.view  = new QwinTreeviewPrototype(paths);
    } catch(e) {
      log.exception(e);
    }
  }; // end reloadTree(aPrefix)

  this.onHotkeyCaseInsensitiveLookUp = function() {
      try {
        this.reloadCompletionTree(
            null, !ko.extensions.qwin.prefs.completionIgnoreCase, true);
      } catch (e) {
          log.exception(e);
      }
  }

  this.reloadCompletionTree = function(currentPos, completionIgnoreCase, force)
  {
    try {
        if (!ko.extensions.qwin.prefs.enableCompletion) return;

        if (!currentPos) {
          try {
            var curpos = ko.extensions.qwin.getCurrentCompletionPos();
          } catch(e) {
            //var prefix = ko.extensions.qwin.prefs.displayWhere;
            //var tree   = document.getElementById("qwin-" + prefix + "-completiontree");
            var tree   = ko.extensions.qwin.getElement("completiontree");

            tree.view = new QwinTreeviewPrototype([]);
            ko.extensions.qwin.completionsShown = '';
            ko.extensions.qwin.completionsShownAt = null;
            return;
          }
        } else {
          var curpos = currentPos;
        }
        if ((ko.extensions.qwin.completionsShown != curpos) || force) {
          var words  = ko.extensions.qwin.getCompletion(completionIgnoreCase, curpos);
          //log.warn("reloadCompletionTree "+curpos);
          //var prefix = ko.extensions.qwin.prefs.displayWhere;
          //var tree   = document.getElementById("qwin-" + prefix + "-completiontree");
          var tree   = ko.extensions.qwin.getElement("completiontree");

          tree.view  = new QwinTreeviewPrototype(words);

          timeSvc = Components.classes["@activestate.com/koTime;1"].
              getService(Components.interfaces.koITime);
          var curTime = timeSvc.time();

          //if (ko.extensions.qwin.completionsShownAt) {
          //  var msg = 'last reloadCompletionTree '+curpos+' '
          //            +(curTime-ko.extensions.qwin.completionsShownAt);
          //  log.warn(msg);
          //};

          ko.extensions.qwin.completionsShown = curpos;
          ko.extensions.qwin.completionsShownAt = curTime;
        }
    } catch(e) {
      log.exception(e);
    }
  }; // end reloadCompletionTree(aPrefix)

  this.reloadClipboardTree = function()
  {
    try {
        if (!ko.extensions.qwin.prefs.enableClipboard) return;

        var parts  = new Array();
        var index = 1;
        for (var i in ko.extensions.qwin.clipboardHistory.items) {
            var text = ko.extensions.qwin.clipboardHistory.items[i].text;
            var current = ko.extensions.qwin.clipboardHistory.items[i].current;
            parts.push(new QwinTreeitemPrototype(index,
                                              this.trim(text),
                                              text,
                                              '',
                                              false,
                                              i, // stash in index
                                              current));
            index++;
        }

        if (!QWIN_CLIPBOARD_HISTORY_LRU) {
            parts.reverse();
            var index = 1;
            for (var i in parts) {
                parts[i].index = this.indexMaker(index);
                index ++;
            }
        }

        //var prefix = ko.extensions.qwin.prefs.displayWhere;
        //var tree   = document.getElementById("qwin-" + prefix + "-clipboardtree");
        var tree   = ko.extensions.qwin.getElement("clipboardtree");

        tree.view  = new QwinTreeviewPrototype(parts);
    } catch(e) {
      log.exception(e);
      dump(e);
    }
  }; // end reloadClipboardTree(aPrefix)

  this.trim = function(str) {
    return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
  }

  this.onTimer = function()
  {
    try {
        if (!ko.extensions.qwin.prefs.enableCompletion) return;

        try {
          var curpos = ko.extensions.qwin.getCurrentCompletionPos();
        } catch(e) {
          ko.extensions.qwin.lastCompletionPos = '';
          ko.extensions.qwin.reloadCompletionTree(
                null, ko.extensions.qwin.prefs.completionIgnoreCase, true);
          return;

          log.warn('onTimer getCurrentCompletionPos failed');
        }

        if (ko.extensions.qwin.lastCompletionPos != curpos) {
          //if position changed since last fire
          ko.extensions.qwin.reloadCompletionTree(
            curpos, ko.extensions.qwin.prefs.completionIgnoreCase, false);
        }

        //timeSvc = Components.classes["@activestate.com/koTime;1"].
        //    getService(Components.interfaces.koITime);
        //
        //var curTime = timeSvc.time();
        //
        //if (ko.extensions.qwin.lastCompletionPosAt) {
        //  var msg = 'last onTimer '+curpos+' '
        //            +(curTime-ko.extensions.qwin.lastCompletionPosAt);
        //  log.warn(msg);
        //}

        ko.extensions.qwin.lastCompletionPos = curpos;
        //ko.extensions.qwin.lastCompletionPosAt = curTime;
    } catch(e) {
      log.exception(e);
    }
  }; // end onTimer(aPrefix)

  this.hasClipboardHistory = function(text)
  {
    try {
        if (ko.extensions.qwin.clipboardHistory.length) {
            for (var i in ko.extensions.qwin.clipboardHistory.items) {
                if (ko.extensions.qwin.clipboardHistory.items[i].text == text) {
                    return true;
                }
            }
        }
    } catch(e) {
      log.exception(e);
    }
    return false;
  };

  this.incrementUsageCount = function(text)
  {
    try {
        for (var i in ko.extensions.qwin.clipboardHistory.items) {
            ko.extensions.qwin.clipboardHistory.items[i].current = false;
        }

        for (var i in ko.extensions.qwin.clipboardHistory.items) {
            if (ko.extensions.qwin.clipboardHistory.items[i].text == text) {
                ko.extensions.qwin.clipboardHistory.items[i].usageCount += 1;
                ko.extensions.qwin.clipboardHistory.items[i].current = true;
            }
        }

        ko.extensions.qwin.reloadClipboardTree();
    } catch(e) {
      log.exception(e);
    }
  };

  this.addToClipboardHistory = function(text)
  {
    try {
        var found = this.hasClipboardHistory(text);

        if (found) {
            this.incrementUsageCount(text);
        } else {
            var hst = ko.extensions.qwin.clipboardHistory;
            var leastCount = 99999;
            for (var i in hst.items) {
                hst.items[i].current = false;
                if (hst.items[i].usageCount < leastCount) {
                    leastCount = hst.items[i].usageCount
                }
            }

            ko.extensions.qwin.clipboardHistoryCounter += 1;
            item = new QwinClipboardItemPrototype(
                text, 0, ko.extensions.qwin.clipboardHistoryCounter, true);

            if (QWIN_CLIPBOARD_HISTORY_LRU) {
                if (hst.length < hst.maxItems) {
                    // just push
                    hst.push(item);
                } else {
                    // find a LRU item to replace
                    var leastIdx = ko.extensions.qwin.clipboardHistoryCounter;
                    for (var i in hst.items) {
                        if (hst.items[i].usageCount == leastCount) {
                            if (hst.items[i].addIndex < leastIdx) {
                                leastIdx = hst.items[i].addIndex;
                            }
                        }
                    }
                    if (leastIdx == ko.extensions.qwin.clipboardHistoryCounter) {
                        //alert("just push");
                        // huhh, not found, just push
                        hst.push(item);
                    } else {
                        // replace
                        //alert("replace "+leastIdx);
                        for (var i in hst.items) {
                            if (hst.items[i].addIndex == leastIdx) {
                                //alert("replacing "+i);
                                hst.items[i] = item;
                            }
                        }
                    }
                }
            } else {
                hst.push(item);
            }
            this.reloadClipboardTree();
        }
    } catch(e) {
      log.exception(e);
    }
  };

  this.onClipboardTimer = function()
  {
    try {
        if (!ko.extensions.qwin.prefs.enableClipboard) return;

        timeSvc = Components.classes["@activestate.com/koTime;1"].
            getService(Components.interfaces.koITime);

        var startTime = timeSvc.time();

        try {
            var clipTxt = xtk.clipboard.getText();
            // don't store brutally long entries
            if (clipTxt.length > 40960) {
                clipTxt = null;
            }
        } catch (e) {
            var clipTxt = null;
        }

        if (clipTxt) {
            if (ko.extensions.qwin.lastClipboardHistoryText != clipTxt) {
                if (!this.hasClipboardHistory(clipTxt)) {
                    this.addToClipboardHistory(clipTxt);
                }
                ko.extensions.qwin.lastClipboardHistoryText = clipTxt;
            }
        }

        var duration = timeSvc.time() - startTime;
        var maxTime = (ko.extensions.qwin.prefs.completionSpeed / 1000)/2;
        if (duration > maxTime) {
          var msg = "onClipboardTimer in "+duration;
          log.warn(msg);
        };

    } catch(e) {
      log.exception(e);
    }
  }; // end onClipboardTimer(aPrefix)


  /**
   * Returns currently selected view in tree of active Qwin's sidebar
   */
  this.getCurrentlySelectedView = function()
  {
    try {
      //var prefix = ko.extensions.qwin.prefs.displayWhere;
      //var tree   = document.getElementById("qwin-" + prefix + "-tree");
      var tree   = ko.extensions.qwin.getElement("tree");
      var uri    = tree.view.getCellValue(tree.currentIndex,
                                          tree.columns.getPrimaryColumn());

      // XXX: that does not work for unsaved docs
      return ko.views.manager.getViewForURI(uri);
    } catch(e) {
      log.exception(e);
    }

    return null;
  }; // end getCurrentlySelectedView()

  /**
   * Returns currently selected view in tree of active Qwin's sidebar
   */
  this.getCurrentlySelectedCompletion = function()
  {
    try {
      //var prefix = ko.extensions.qwin.prefs.displayWhere;
      //var tree   = document.getElementById("qwin-" + prefix + "-completiontree");
      var tree   = ko.extensions.qwin.getElement("completiontree");
      var label  = tree.view.getCellValue(tree.currentIndex,
                                          tree.columns.getPrimaryColumn());

      return label;
    } catch(e) {
      log.exception(e);
    }

    return null;
  }; // end getCurrentlySelectedCompletion()


  /**
   * Fired when user doubleclicked on any tree item (document)
   */
  this.onTreeDblClick = function()
  {
    try {
      if(!ko.extensions.qwin.prefs.enableQwin) return;

      var view = this.getCurrentlySelectedView();
      if(!view) return;

      view.makeCurrent(true);
      view.setFocus();
    } catch(e) {
      log.exception(e);
    }
  }; // end onTreeDblClick()

  /**
   * Fired when user doubleclicked on any tree item (completiontree)
   */
  this.onCompletionTreeDblClick = function()
  {
    try {
      if (!ko.extensions.qwin.prefs.enableQwin) return;

      var newword = this.getCurrentlySelectedCompletion();
      if (!newword) return;

      //var view = ko.views.manager.currentView;
      var sm = ko.views.manager.currentView.scimoz;

      sm.beginUndoAction();

      var word = ko.extensions.qwin.completionWord;
      sm.anchor = sm.currentPos - word.length;
      sm.replaceSel('')
      sm.replaceSel(newword)

      ko.extensions.qwin.lastInsertedWord = newword;
      ko.extensions.qwin.addToClipboardHistory(newword);
      //var prefix    = ko.extensions.qwin.prefs.displayWhere;
      //var txtbox    = document.getElementById("qwin-" + prefix + "-last_inserted");
      var txtbox    = ko.extensions.qwin.getElement("last_inserted");
      txtbox.value = newword;

      sm.endUndoAction();

      sm.scrollCaret();

    } catch(e) {
      log.exception(e);
    }
  }; // end onCompletionTreeDblClick()

  /**
   * Returns currently selected view in tree of active Qwin's sidebar
   */
  this.getCurrentlySelectedClipboard = function()
  {
    try {
      //var prefix = ko.extensions.qwin.prefs.displayWhere;
      //var tree   = document.getElementById("qwin-" + prefix + "-clipboardtree");
      var tree   = ko.extensions.qwin.getElement("clipboardtree");
      var label  = tree.view.getCellValue(tree.currentIndex,
                                          tree.columns.getPrimaryColumn());

      return label;
    } catch(e) {
      log.exception(e);
    }

    return null;
  }; // end getCurrentlySelectedClipboard()

  this.onClipboardTreeDblClick = function()
  {
    try {
      //if (!ko.extensions.qwin.prefs.enableQwin) return;

      var newword = this.getCurrentlySelectedClipboard();
      if (!newword) return;

      //var view = ko.views.manager.currentView;
      var sm = ko.views.manager.currentView.scimoz;

      sm.beginUndoAction();
      sm.replaceSel(newword)
      sm.endUndoAction();
      sm.scrollCaret();

      ko.extensions.qwin.incrementUsageCount(newword);

    } catch (e) {
        log.exception(e);
    }
  }

  this.getCurrentCompletionPos = function(aEvent)
  {
    var cv = ko.views.manager.currentView;
    //var sm = ko.views.manager.currentView.scimoz;
    var curinsert = cv.scimoz.currentPos;
    //ko.views.manager.currentView.document.displayPath;
    var curdoc = cv.koDoc.displayPath;

    var pos = curdoc+"#"+curinsert;
    return pos;
  }

  this.onHotkeyInsertCurrentHistoryItem = function(index) {
    try {
        var hst = ko.extensions.qwin.clipboardHistory;
        var current = null;
        for (var i in hst.items) {
            if (hst.items[i].current) {
                current = hst.items[i].text;
            }
        }

        if (current) {
            var sm = ko.views.manager.currentView.scimoz;

            sm.beginUndoAction();

            //sm.insertText(sm.currentPos, ko.extensions.qwin.lastInsertedWord)
            //sm.currentPos = sm.currentPos+ko.extensions.qwin.lastInsertedWord.length
            sm.replaceSel(current)

            sm.endUndoAction();

            sm.scrollCaret();
        }
    } catch (e) {
        log.exception(e);
    }
  }; // end onHotkeyInsertCurrentHistoryItem

  this.onHotkeySwitchTab = function(index) {
    try {
        //var prefix  = ko.extensions.qwin.prefs.displayWhere;
        //var tree    = document.getElementById("qwin-" + prefix + "-tree");
        var tree    = ko.extensions.qwin.getElement("tree");

        // TODO: do a LAST tab
        tree.currentIndex = index-1;
        ko.extensions.qwin.onTreeDblClick(null);
    } catch (e) {
        log.exception(e);
    }
  }; // end onHotkeySwitchTab

  this.onHotkeyInsertIntelli = function(index) {
    try {
        //var prefix  = ko.extensions.qwin.prefs.displayWhere;
        //var tree    = document.getElementById("qwin-" + prefix + "-completiontree");
        var tree   = ko.extensions.qwin.getElement("completiontree");

        if (index == 99 && ko.extensions.qwin.lastInsertedWord) {
            var sm = ko.views.manager.currentView.scimoz;

            sm.beginUndoAction();

            //sm.insertText(sm.currentPos, ko.extensions.qwin.lastInsertedWord)
            //sm.currentPos = sm.currentPos+ko.extensions.qwin.lastInsertedWord.length
            sm.replaceSel(ko.extensions.qwin.lastInsertedWord)

            sm.endUndoAction();

            sm.scrollCaret();
        } else {
            tree.currentIndex = index-1;
            ko.extensions.qwin.onCompletionTreeDblClick(null);
        }
    } catch (e) {
        log.exception(e);
    }
  }; // end onHotkeyInsertIntelli


  this.onHotkeyInsertClipboard = function(index) {
    try {
        //var prefix = ko.extensions.qwin.prefs.displayWhere;
        //var tree   = document.getElementById("qwin-" + prefix + "-clipboardtree");
        var tree   = ko.extensions.qwin.getElement("clipboardtree");

        tree.currentIndex = index-1;
        ko.extensions.qwin.onClipboardTreeDblClick(null);
    } catch (e) {
        log.exception(e);
    }
  }; // end onHotkeyInsertClipboard


  /**
   * Implements other Qwin commands. All commands are related
   * to active Qwin's sidebar (left or right doesn't matter)
   *
   * @param aCmd {String}
   */
  this.doCommand = function(aCmd)
  {
    switch(aCmd)
    {
      // Show currently selected view
      case "showView":
        this.onTreeDblClick();
        break;

      // Close currently selected view
      case "closeView":
        var view = this.getCurrentlySelectedView();
        if(view) view.close();
        break;

      // Close all opened views excluding selected one and Start Page
      case "closeAllOthers":
        this.closeAllOtherViews();
        break;

      // Show Qwin's Preferences dialog
      case "showPrefs":
        var dlg = window.open("chrome://qwin/content/preferences.xul", "",
            "chrome,extrachrome,titlebar,toolbar,modal,centerscreen");
        if(dlg) dlg.focus();
        break;
    }
  }; // end doCommand(aCmd)


  /**
   * Go through the opened views and close all views but currently selected
   * and Start Page not.
   */
  this.closeAllOtherViews = function()
  {
    try {
      var current = ko.views.manager.currentView;
      var views   = ko.views.manager.topView.getDocumentViewList(true);
      var index   = 1;

      for(var i=0; i<views.length; i++)
      {
        var view = views[i];
        var viewtype = view.getAttribute("type");

        if(typeof(view.koDoc) == "undefined" || !view.koDoc ||
           viewtype == "startpage")
          continue;

        if(current.koDoc.displayPath != view.koDoc.displayPath)
          view.close();
      }
    } catch(e) {
      log.exception(e);
    }
  }; // end closeAllOtherViews()

  this.onHotkeyGotoTab = function()
  {
    try {
        // Clear any existing line information.
        var gotoTabTextbox = document.getElementById('gotoTab_textbox');
        gotoTabTextbox.value = "";
        // Get the current scintilla position.
        var currentView = ko.views.manager.currentView;
        /** @type {Components.interfaces.ISciMoz} */
        var scimoz = currentView.scimoz;
        var middleLine = scimoz.firstVisibleLine + (scimoz.linesOnScreen / 2) - 5;
        var pos = scimoz.positionFromLine(middleLine);
        var x = scimoz.pointXFromPosition(pos);
        var y = scimoz.pointYFromPosition(pos);
        // Show the goto line panel/popup.
        var panel = document.getElementById("gotoTab_panel");
        panel.openPopup(ko.views.manager.currentView, "after_pointer", x, y);
    } catch(e) {
      log.exception(e);
    }
  };

  this.onHotkeyGotoTab_onkeypress_handler = function (event)
  {
    try {
      if (event.keyCode != event.DOM_VK_ENTER &&
          event.keyCode != event.DOM_VK_RETURN) {
          return;
      }
      // Stop the event from being consumed by Komodo's keybinding manager.
      event.preventDefault();
      event.stopPropagation();

      var gotoTabTextbox = document.getElementById("gotoTab_textbox");
      var tabnumber = gotoTabTextbox.value;
      if (!tabnumber)
          return;

      // Parse the tabnumber, creates [sign, num] variables for the given tabnumber string.
      //   42     sign=null, num=42
      //   +1     sign=+, num=1
      //   a      sign=null, num=NaN
      var stripped = tabnumber.replace(/(^\s*|\s*$)/g, '');
      var sign = null;
      var num;
      if (stripped[0] == "-" || stripped[0] == "+") {
          sign = stripped[0];
          num = parseInt(stripped.substring(1, stripped.length));
      } else {
          sign = null;
          num = parseInt(stripped);
      }
      //dump("parseTab(tabnumber="+tabnumber+"): sign="+sign+", num="+num+"\n");

      // Validate the tabnumber:
      //   Good: 1, 42, +12, -5.
      //   Bad: a, +1a, -, 3.14
      var errorBox = document.getElementById('gotoTab_error_hbox');
      if (isNaN(num) || num < 0) {
          var errorLabel = document.getElementById('gotoTab_error_label');
          errorLabel.value = _bundle.formatStringFromName("isInvalidYoumustEnterANumber.alert", [tabnumber], 1);
          errorBox.removeAttribute("collapsed");
          return;
      }
      errorBox.setAttribute("collapsed", "true");

      var gotoTabPanel = document.getElementById("gotoTab_panel");
      gotoTabPanel.hidePopup();

      // Go to the given tabnumber.

      //var prefix    = ko.extensions.qwin.prefs.displayWhere;
      //var tree      = document.getElementById("qwin-" + prefix + "-tree");
      var tree      = ko.extensions.qwin.getElement("tree");

      if (tabnumber >= 0) {
        tabnumber--;
        // Switch the view if requested view was found
        tree.currentIndex = tabnumber;
        ko.extensions.qwin.onTreeDblClick(null);
        return;
      }

      //var view = ko.views.manager.currentView;
      //var scimoz = view.scintilla.scimoz;
      //var currTab;
      //var targetTab;
      //switch (sign) {
      //    case null:
      //        scimoz.gotoTab(num-1);  // scimoz handles out of bounds
      //        targetTab = num - 1;
      //        break;
      //    case "+":
      //        currTab = scimoz.tabnumberFromPosition(scimoz.currentPos);
      //        targetTab = currTab + num;
      //        break;
      //    case "-":
      //        currTab = scimoz.tabnumberFromPosition(scimoz.currentPos);
      //        targetTab = currTab - num;
      //        break;
      //    default:
      //        log.error("unexpected goto tabnumber 'sign' value: '"+sign+"'")
      //        targetTab = null;
      //        break;
      //}
      //if (targetTab != null) {
      //    scimoz.gotoTab(targetTab);
      //    scimoz.ensureVisible(targetTab);
      //    scimoz.scrollCaret();
      //}
    } catch(e) {
      log.exception(e);
    }
  }

}).apply(ko.extensions.qwin);

// ===========================================================================

// Initialize it once Komodo has finished loading
// XXX: Use an observer or notification mechanism.
window.addEventListener("load",
                 function(event){setTimeout("ko.extensions.qwin.onLoad()", 3000);},
                 false);
window.addEventListener("unload",
                        function(event) { ko.extensions.qwin.shutdown(); }, false);
