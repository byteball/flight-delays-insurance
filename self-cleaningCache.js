const conf = require('byteballcore/conf');

const seconds = 60*60

module.exports = class {
    constructor() {
        this.data = []

        setInterval(this.check, 1000 /*  * 60 */, this)
    }

    check(self) {
        const _data = [], hours = Math.floor(((new Date).getTime()/1000)/(seconds*conf.cacheHours))

        self.data.forEach(object => object.hours == hours ? _data.push(object) : void 0)

        self.data = _data
    }

    set(key, data) {
        const _data = [], hours = Math.floor(((new Date).getTime()/1000)/(seconds*conf.cacheHours))

        let noPush
        
        this.data.forEach((object) => {
            if (object.hours == hours) {
                object.data[key] = data

                noPush = true
            }

            _data.push(object)
        })

        if (!noPush)
            this.data.push({ hours, data: { [key]: data } })
        else 
            this.data = _data
    }

    get(key) {
        const hours = Math.floor(Math.floor((new Date).getTime()/1000)/(seconds*conf.cacheHours))

        let retn

        this.data.forEach((object) => {
            if (object.hours == hours) {
                if(object.data[key] !== undefined) {
                    retn = object.data[key]

                    return
                }
            }
        })

        return retn
    }
}