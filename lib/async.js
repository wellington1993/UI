var Immutable = require("immutable");

module.exports = {
    /**
     * The UI uses it's own server/port
     * @param ui
     * @param done
     */
    findAFreePort: function (ui, done) {
        var port = ui.opts.get("port");
        ui.bs.utils.portscanner.findAPortNotInUse(port, port + 100, {
            host: "localhost",
            timeout: 1000
        }, function (err, port) {
            if (err) {
                return done(err);
            }
            done(null, {
                options: {
                    port: port
                }
            });
        });
    },
    /**
     * Default hooks do things like creating/joining JS files &
     * building angular config
     * @param ui
     * @param done
     */
    initDefaultHooks: function (ui, done) {

        var out = ui.pluginManager.hook("page", ui);

        done(null, {
            instance: {
                clientJs:    ui.pluginManager.hook("client:js"),
                templates:   ui.pluginManager.hook("templates"),
                pagesConfig: out.pagesConfig,
                pages:       out.pagesObj,
                pageMarkup:  out.pageMarkup
            }
        });
    },
    /**
     * Simple static file server with some middlewares for custom
     * scripts/routes.
     * @param ui
     * @param done
     */
    startServer: function (ui, done) {

        var bs          = ui.bs;
        var port        = ui.opts.get("port");

        ui.logger.debug("Using port %s", port);

        var server = require("./server")(ui, {
            middleware: {
                socket: bs.getMiddleware("socket-js"),
                connector: bs.getSocketConnector(bs.options.get("port"), {
                    path: bs.options.getIn(["socket", "path"]),
                    namespace: ui.config.getIn(["socket", "namespace"])
                })
            }
        });

        bs.registerCleanupTask(function () {
            if (server.server) {
                server.server.close();
            }
        });

        done(null, {
            instance: {
                server: server.server.listen(port),
                app: server.app
            }
        });

    },
    /**
     * Run default plugins
     * @param ui
     * @param done
     */
    registerPlugins: function (ui, done) {
        Object.keys(ui.defaultPlugins).forEach(function (key) {
            ui.pluginManager.get(key)(ui, ui.bs);
        });
        done();
    },
    /**
     * The most important event is the initial connection where
     * the options are received from the socket
     * @param ui
     * @param done
     */
    addOptionsEvent: function (ui, done) {
        var bs = ui.bs;
        ui.socket.on("connection", function (client) {
            client.emit("connection", bs.getOptions().toJS());
            client.emit("cp:connection", ui.options.toJS());
            client.on("cp:get:options", function () {
                client.emit("cp:receive:options", bs.getOptions().toJS());
            });
            // proxy client events
            client.on("cp:client:proxy", function (evt) {
                ui.clients.emit(evt.event, evt.data);
            });
        });
        done();
    },
    /**
     * Allow an API for adding/removing elements to clients
     * @param ui
     * @param done
     */
    addElementEvents: function (ui, done) {

        var elems = ui.pluginManager.hook("elements");
        var bs    = ui.bs;

        if (!Object.keys(elems).length) {
            return done();
        }

        bs.setOption("clientFiles", Immutable.fromJS(elems));

        done(null, {
            instance: {
                enableElement:  require("./client-elements").enable(ui.clients, ui, bs),
                addElement:     require("./client-elements").addElement,
                disableElement: require("./client-elements").disable(ui.clients, ui, bs)
            }
        });
    }
};