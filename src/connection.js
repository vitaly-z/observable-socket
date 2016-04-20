import debug from 'debug'
import { EventEmitter } from 'events'
import { Observable } from 'rx'
import { has } from 'lodash'

const log = debug('observable-socket')

export default function observableSocket (_ws) {
    let ws // init

    // Normalize events between browser and node. Assumes node libs follow the
    // same pattern that "ws" does, i.e. socket.io *does not* work.
    if (has(global, 'WebSocket')) {
        ws = new EventEmitter()

        _ws.addEventListener('close', () => ws.emit('close'))
        _ws.addEventListener('error', () => ws.emit('error'))
        _ws.addEventListener('open',  () => ws.emit('open'))

        _ws.addEventListener('message', e => ws.emit('message', e.data))
    } else {
        ws = _ws
    }

    const ready = () => _ws.readyState === 1
    const send = message => _ws.send(message)

    const readyToSend = new Promise(function (resolve) {

        // If we make an Observable from an already connected socket, we'll
        // never hear anything about 'open'.
        if (ready()) {
            log('already opened')

            resolve(send)
        } else {
            ws.once('open', function () {
                log('opened')

                resolve(send)
            })
        }
    })

    // Compose socket event streams, so that external subscribers have
    // a single interface that forwards socket events to onNext, onError and
    // onCompleted.
    const socketStream = Observable.create(function (observer) {
        const messageDisposable = Observable.fromEvent(ws, 'message')
            .subscribe(function onNext (e) {
                debug('observable-socket:onNext')('message')

                observer.onNext(e)
            })

        const errorDisposable = Observable.fromEvent(ws, 'error')
            .subscribe(function onNext (e) {
                log('error', e)

                observer.onError(e)
            })

        const closeDisposable = Observable.fromEvent(ws,'close')
            .subscribe(function onNext (e) {
                log('closed')

                observer.onCompleted(e)
            })

        return function disposeAndEmit () {
            closeDisposable.dispose()
            errorDisposable.dispose()
            messageDisposable.dispose()
        }
    })

    return {
        send: message => readyToSend.then(send => send(message)),
        observable: socketStream,
    }
}
