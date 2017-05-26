const fb = require('facebook-chat-api'),
    EventEmitter = require('events'),
    fs = require('fs');

class FacebookIntegrationApi extends shim {
    constructor (commandPrefix, api) {
        super(commandPrefix);
        this._baseApi = api;
        this._threadInfo = {};
        this._endTyping = null;
    }

    _stopTyping () {
        if (this._endTyping) {
            this._endTyping();
            this._endTyping = null;
        }
    }

    sendMessage (message, thread) {
        this._stopTyping();
        this._baseApi.sendMessage({body:message}, thread);
    }

    sendUrl (url, thread) {
        this._stopTyping();
        this._baseApi.sendMessage({body: url, url: url}, thread);
    }

    sendImage (type, image, description, thread) {
        this._stopTyping();
        switch (type) {
            case 'url':
                this._baseApi.sendMessage({ body: description, url: image }, thread, err => {
                    if (err) {
                        this._baseApi.sendMessage(`${description} ${image}`, thread);
                    }
                });
                break;
            case 'file':
                this._baseApi.sendMessage({ body: description, attachment: fs.createReadStream(image) }, thread);
                break;
            default:
                this._baseApi.sendMessage(description, thread);
                this._baseApi.sendMessage(image, thread);
                break;
        }
    }

    sendFile (...args) {
        this.sendImage.apply(this, args);
    }

    sendTyping (thread) {
        this._stopTyping();
        this._baseApi.sendTypingIndicator(thread, (err, end) => {
            if (!err) {
                this._endTyping = end;
            }
        });
    }

    setTitle (title, thread) {
        this._stopTyping();
        this._baseApi.setTitle(title, thread);
    }

    getUsers (thread) {
        return thread ? this._threadInfo[thread] : this._threadInfo;
    }

    _facebookLogout() {
        this._baseApi.logout();
        this._baseApi = null;
    }
}

class FacebookIntegration extends EventEmitter {
    constructor () {
        super();
        this._unknownIter = 1;
        this._stopListeningMethod = null;
        this._integrationApi = null;
    }

    _getSenderInfo (ids, api, event, finished) {
        const threadInfo = this._integrationApi.getUsers();
        const callback = (err, info) => {
            if (err) {
                return finished(`<Unknown User ${this._unknownIter++}>`);
            }
            for (let id in info) {
                threadInfo[event.threadID][id] = {
                    id: id,
                    name: info[id].name,
                    email: 'unknown@foo.bar'
                };
            }
            return finished(threadInfo[event.threadID][event.senderID].name);
        };
        api.getUserInfo(ids, callback);
    }

    _getSenderName (api, event, finished) {
        const threadInfo = this._integrationApi.getUsers();
        if (threadInfo[event.threadID] && threadInfo[event.threadID][event.senderID]) {
            return finished(threadInfo[event.threadID][event.senderID].name);
        }

        if (!threadInfo[event.threadID]) {
            threadInfo[event.threadID] = {};
            api.getThreadInfo(event.threadID, (err, info) => {
                if (err) {
                    return finished(`<Unknown User ${this._unknownIter++}>`);
                }
                this._getSenderInfo(info.participantIDs, api, event, finished);
            });
        }
        else {
            this._getSenderInfo([event.senderID], api, event, finished);
        }
    }

    getApi () {
        return this._integrationApi;
    }

    start (callback) {
        fb({email: this.config.username, password: this.config.password}, (err, api) => {
            if (err) {
                LOG.error(err);
                throw new Error(err);
            }

            api.setOptions({
                listenEvents: true
            });

            this._integrationApi = new FacebookIntegrationApi(this.config.commandPrefix, api);
            this._stopListeningMethod = api.listen((err, event) => {
                if (err) {
                    this._stopListeningMethod();
                    throw new Error(err);
                }

                switch (event.type) {
                    case 'message':
                    {
                        this._getSenderName(api, event, name => {
                            const data = shim.createEvent(event.threadID, event.senderID, name, event.body + '');
                            callback(this._integrationApi, data);
                        });
                        break;
                    }
                    case 'event':
                        switch (event.logMessageType) {
                            case 'log:unsubscribe':
                            {
                                const usrs = event.logMessageData.removed_participants,
                                    threadInfo = this._integrationApi.getUsers();
                                for (let i = 0; i < usrs.length; i++) {
                                    usrs[i] = usrs[i].split(':')[1];
                                    if (threadInfo[event.threadID] && threadInfo[event.threadID][usrs[i]]) {
                                        delete threadInfo[event.threadID][usrs[i]];
                                    }
                                }
                                break;
                            }
                            case 'log:subscribe':
                            {
                                const usrs = event.logMessageData.added_participants;
                                for (let i = 0; i < usrs.length; i++) {
                                    usrs[i] = usrs[i].split(':')[1];
                                }
                                this._getSenderInfo(usrs, api, event, () => {});
                                break;
                            }
                            default:
                                LOG.silly(`Event '${event.logMessageType}' was unhandled.`);
                                break;
                        }
                        break;
                    case 'read_receipt':
                    {
                        this.emit('read', {
                            sender_id: event.reader,
                            thread_id: event.threadID
                        });
                        break;
                    }
                    default:
                        LOG.silly(`Message '${event.type}' was unhandled.`);
                        break;
                }
            });
        });
    }

    stop () {
        if (this._stopListeningMethod) {
            this._stopListeningMethod();
            this._stopListeningMethod = null;
        }
        if (this._integrationApi) {
            this._integrationApi._stopTyping();
            this._integrationApi._facebookLogout();
            this._integrationApi = null;
        }
    }
}

module.exports = new FacebookIntegration();
