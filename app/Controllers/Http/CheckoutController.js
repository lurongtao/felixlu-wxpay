'use strict'

const logger       = use('App/Services/Logger')
const Config       = use('Config')
const moment       = use('moment')
const randomString = use('randomstring')
const queryString  = use('querystring')
const crypto       = use('crypto')
const convert      = use('xml-js')
const axios        = use('axios')
const qrcode       = use('qrcode')

class CheckoutController {
  wxPaySign(data, key) {
    // 1.排序
    const sortedOrder = Object.keys(data).sort().reduce((accumulator, key) => {
      accumulator[key] = data[key]
      return accumulator
    }, {})

    // 2.转化为地址查询符
    const stringOrder = queryString.stringify(sortedOrder, null, null, {
      encodeURIComponent: queryString.unescape
    })

    // 3.结尾加上秘钥
    const stringOrderWithKey = `${ stringOrder }&key=${ key }`

    // 4.md5 后全部大写
    const sign = crypto.createHash('md5').update(stringOrderWithKey).digest('hex').toUpperCase()

    return sign
  }

  async render({ view }) {
    // 公众账号 ID
    const appid = Config.get('wxpay.appid')

    // 商户号
    const mch_id = Config.get('wxpay.mch_id')

    // 秘钥
    const key = Config.get('wxpay.key')

    // 商户订单号
    const out_trade_no = moment().local().format('YYYYMMDDHHmmss')

    // 商品描述
    const body = 'felixlu'

    // 商品价格
    const total_fee = 1

    // 支付类型
    const trade_type = 'NATIVE'

    // 商品ID（如果支付类型为NATIVE, 商品ID必填）
    const product_id = 1

    // 通知地址
    const notify_url = Config.get('wxpay.notify_url')

    // 随机字符
    const nonce_str = randomString.generate(32)

    // 统一下单接口
    const unifiedOrderApi = Config.get('wxpay.api.unifiedorder')

    let order = {
      appid,
      mch_id,
      out_trade_no,
      body,
      trade_type,
      total_fee,
      product_id,
      notify_url,
      nonce_str
    }

    const sign = this.wxPaySign(order, key)

    order = {
      xml: {
        ...order,
        sign
      }
    }

    // 转换成xml
    const xmlOrder = convert.js2xml(order, {
      compact: true
    })

    const wxPayResponse = await axios.post(unifiedOrderApi, xmlOrder)

    const _prepay = convert.xml2js(wxPayResponse.data, {
      compact: true,
      cdataKey: 'value',
      textKey: 'value'
    }).xml

    const prepay = Object.keys(_prepay).reduce((accumulator, key) => {
      accumulator[key] = _prepay[key].value
      return accumulator
    }, {})

    // 生成二维码链接
    const qrcodeUrl = await qrcode.toDataURL(prepay.code_url, { width: 300 })

    return view.render('commerce.checkout', { qrcodeUrl })
  }

  wxPayNotify({ request }) {
    const _payment = convert.xml2js(request._raw, {
      compact: true,
      cdataKey: 'value',
      textKey: 'value'
    }).xml

    const payment = convert.keys(_payment).reduce((accumulator, key) => {
      accumulator[key] = _payment[key].value
      return accumulator
    })

    const paymentSign = payment.sign

    delete payment['sign']

    const key = Config.get('wxpay.key')

    const selfSign = this.wxPaySign(payment, key)

    const return_code = paymentSign === selfSign ? 'SUCCESS' : 'FAIL'

    const reply = {
      xml: {
        return_code
      }
    }

    return convert.js2xml(reply, {
      compact: true
    })
  }
}

module.exports = CheckoutController
