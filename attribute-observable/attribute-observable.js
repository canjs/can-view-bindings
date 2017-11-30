var queues = require("can-queues");
var canEvent = require("../can-event");
var canReflect = require("can-reflect");
var Observation = require("can-observation");
var attr = require("can-util/dom/attr/attr");
var getEventName = require("./get-event-name");
var canReflectDeps = require("can-reflect-dependencies");
var ObservationRecorder = require("can-observation-recorder");
var valueEventBindings = require("can-event-queue/value/value");
var SettableObservable = require("can-simple-observable/settable/settable");

var isSelect = function isSelect(el) {
	return el.nodeName.toLowerCase() === "select";
};

var isMultipleSelect = function isMultipleSelect(el, prop) {
	return isSelect(el) && prop === "value" && el.multiple;
};

function AttributeObservable(el, prop, bindingData, event) {
	valueEventBindings.addHandlers(this, {
		onFirst: this.setup.bind(this),
		onEmpty: this.teardown.bind(this)
	});

	this.el = el;
	this.bound = false;
	this.bindingData = bindingData;
	this.prop = isMultipleSelect(el, prop) ? "values" : prop;
	this.event = event || getEventName(el, prop, bindingData);
	this.handler = this.handler.bind(this);

	//!steal-remove-start
	// register what changes the element's attribute
	canReflectDeps.addMutatedBy(this.el, this.prop, this);

	canReflect.assignSymbols(this, {
		"can.getName": function getName() {
			return (
				"AttributeObservable<" +
				el.nodeName.toLowerCase() +
				"." +
				this.prop +
				">"
			);
		}
	});
	//!steal-remove-end
}

AttributeObservable.prototype = Object.create(SettableObservable.prototype);

Object.assign(AttributeObservable.prototype, {
	constructor: AttributeObservable,

	get: function get() {
		if (ObservationRecorder.isRecording()) {
			ObservationRecorder.add(this);
			if (!this.bound) {
				Observation.temporarilyBind(this);
			}
		}
		return attr.get(this.el, this.prop);
	},

	set: function set(newVal) {
		attr.setAttrOrProp(this.el, this.prop, newVal);

		// update the observation internal value
		this.value = newVal;

		return newVal;
	},

	handler: function handler(newVal) {
		var old = this.value;
		this.value = attr.get(this.el, this.prop);

		if (this.value !== old) {
			//!steal-remove-start
			if (typeof this._log === "function") {
				this._log(old, newVal);
			}
			//!steal-remove-end

			// adds callback handlers to be called w/i their respective queue.
			queues.enqueueByQueue(
				this.handlers.getNode([]),
				this,
				[newVal, old],
				function() {
					return {};
				}
			);
		}
	},

	setup: function setup() {
		var observable = this;

		observable.bound = true;

		// make sure `this.handler` gets the new value instead of
		// the event object passed to the event handler
		observable._handler = function() {
			observable.handler(attr.get(observable.el, observable.prop));
		};

		if (observable.event === "radiochange") {
			canEvent.on.call(observable.el, "change", observable._handler);
		}

		canEvent.on.call(observable.el, observable.event, observable._handler);

		// initial value
		this.value = attr.get(this.el, this.prop);
	},

	teardown: function teardown() {
		var observable = this;

		observable.bound = false;

		if (observable.event === "radiochange") {
			canEvent.off.call(observable.el, "change", observable._handler);
		}

		canEvent.off.call(observable.el, observable.event, observable._handler);
	},

	valueHasDependencies: function valueHasDependencies() {
		return true;
	},

	getValueDependencies: function getValueDependencies() {
		return {
			keyDependencies: new Map([[this.el, new Set([this.prop])]])
		};
	}
});

canReflect.assignSymbols(AttributeObservable.prototype, {
	"can.isMapLike": false,
	"can.getValue": AttributeObservable.prototype.get,
	"can.setValue": AttributeObservable.prototype.set,
	"can.onValue": AttributeObservable.prototype.on,
	"can.offValue": AttributeObservable.prototype.off,
	"can.valueHasDependencies": AttributeObservable.prototype.hasDependencies,
	"can.getValueDependencies": AttributeObservable.prototype.getValueDependencies
});

module.exports = AttributeObservable;
