/**
 * JavaScript wrapper for libdds, the bridge double dummy solver.
 *
 * To use:
 *
 *   <script>
 *   var Module = {};
 *   </script>
 *   <script src="out.js"></script>
 *   <script src="dds.js"></script>
 */
(function() {
var _solveBoard = null;
var _calcDDTable = null;

function runtimeModule() {
  return globalThis.e || globalThis.Module || Module;
}

function solveBoardFn() {
  if (!_solveBoard) {
    _solveBoard = runtimeModule().cwrap('solve',
                                        'number',
                                        ['string', 'string', 'number', 'number']);
  }
  return _solveBoard;
}

function calcDDTableFn() {
  if (!_calcDDTable) {
    _calcDDTable = runtimeModule().cwrap('generateDDTable', 'number', ['string']);
  }
  return _calcDDTable;
}

var SUITS = {'S': 0, 'H': 1, 'D': 2, 'C': 3};
var RANKS = {'2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
             '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11,
             'Q': 12, 'K': 13, 'A': 14};
function packPlays(plays) {
  // Validate before allocating; this function owns the buffer until it returns.
  for (var i = 0; i < plays.length; i++) {
    var p = plays[i];
    if (typeof p !== 'string' || p.length !== 2 ||
        SUITS[p[1]] === undefined || RANKS[p[0]] === undefined) {
      throw new Error('Invalid play: ' + p);
    }
  }
  if (!plays.length) return 0;
  var module = runtimeModule(), buf = module._malloc(8 * plays.length);
  if (!buf) throw new Error('DDS could not allocate the played-card buffer.');
  try {
    for (var j = 0; j < plays.length; j++) {
      module.setValue(buf + j * 8, SUITS[plays[j][1]], 'i32');
      module.setValue(buf + j * 8 + 4, RANKS[plays[j][0]], 'i32');
    }
    return buf;
  } catch (error) {
    try { module._free(buf); } catch (_) { /* Preserve the original failure. */ }
    throw error;
  }
}

// Both native exports return a malloc-owned JSON string, including error
// replies. cwrap('string') decodes it but does not free it. Receive the pointer
// instead and copy the reply before releasing both native allocations.
function nativeJson(fn, args, plays) {
  var module = runtimeModule(), input = 0, output = 0, failed = false;
  try {
    if (plays) {
      input = packPlays(plays);
      args = args.concat([plays.length, input]);
    }
    output = fn.apply(null, args);
    if (!output) throw new Error('DDS returned no result buffer.');
    return JSON.parse(module.Pointer_stringify(output));
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    var cleanupError;
    [output, input].forEach(function(ptr) {
      if (ptr) {
        try { module._free(ptr); } catch (error) { if (!cleanupError) cleanupError = error; }
      }
    });
    if (cleanupError && !failed) throw cleanupError;
  }
}

/**
 * board is a PBN-formatted string (e.g. 'N:AKQJ.T98.76.432 ...')
 *       The first character indicates who leads this trick.
 * trump is 'S', 'H', 'C', 'D' or 'N'
 * plays is an array of 2-character cards, e.g. ['5D', '2D, 'QD']
 */
function nextPlays(board, trump, plays) {
  if (!Array.isArray(plays)) throw new Error('DDS play history must be an array.');
  var cacheKey = JSON.stringify({board,trump,plays});
  var cacheValue = nextPlays.cache[cacheKey];
  if (cacheValue) return cacheValue;

  console.time('SolveBoard');
  var o;
  try { o = nativeJson(solveBoardFn(), [board, trump], plays); }
  finally { console.timeEnd('SolveBoard'); }
  nextPlays.cache[cacheKey] = o;
  // console.log(cacheKey, o);
  return o;
}
nextPlays.cache = {};

/**
 * board is a PBN-formatted string (e.g. 'N:AKQJ.T98.76.432 ...')
 * Returns an object mapping strain -> player -> makeable tricks, e.g.
 * {'N': {'N': 1, 'S': 2, 'E': 3, 'W': 4}, 'S': { ... }, ...}
 */
function calcDDTable(board) {
  var v = calcDDTable.cache[board];
  if (v) return v;
  console.time('CalcDDTable');
  try { v = nativeJson(calcDDTableFn(), [board]); }
  finally { console.timeEnd('CalcDDTable'); }
  calcDDTable.cache[board] = v;
  return v;
}
calcDDTable.cache = {};

window.calcDDTable = calcDDTable;
window.nextPlays = nextPlays;

})();
