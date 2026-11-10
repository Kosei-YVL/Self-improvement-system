import assert from 'node:assert/strict';
import {timerWindowView} from '../web/focus-timer-window.mjs';
assert.equal(timerWindowView(null),null);
const s={id:'timer',title:'作業',mode:'timer',goal:1500000,elapsed:0,started:1000,running:true};
assert.equal(timerWindowView(s,61000).text,'00:24:00');assert.equal(timerWindowView(s,1501000).text,'00:25:00');assert.equal(timerWindowView(s,1502000).extraText,'+00:00:01');assert.equal(timerWindowView(s,7201000).text,'02:00:00');assert.equal(timerWindowView(s,7201000).ended,true);
assert.equal(timerWindowView({...s,mode:'stopwatch'},3662000).text,'01:01:01');
assert.equal(timerWindowView({...s,mode:'stopwatch',running:false,elapsed:91000},999999).text,'00:01:31');
assert.equal(timerWindowView({...s,running:false,elapsed:1800000},999999).extraText,'+00:05:00');
console.log('PiP display checks passed: shared elapsed math, deadline crossing, continued counting, long stopwatch, paused clock, absent session.');
