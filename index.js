#!/usr/bin/env node

import fetch from "node-fetch";
import cheerio from 'cheerio';

const USERNAME = process.env.USERNAME
const PASSWORD = process.env.PASSWORD
const SCHEDULE_ID = process.env.SCHEDULE_ID
const FACILITY_ID = process.env.FACILITY_ID

const BASE_URI = 'https://ais.usvisa-info.com/pt-br/niv'

async function main(currentBookedDate) {
  if (!currentBookedDate) {
    log(`Invalid current booked date: ${currentBookedDate}`)
    process.exit(1)
  }

  log(`Initializing with current date ${currentBookedDate}`)

  try {
    const sessionHeaders = await login()

    while(true) {
      const date = await checkAvailableDate(sessionHeaders)

      if (!date) {
        log("no dates available")
      } else if (date > currentBookedDate) {
        log(`nearest date is further than already booked (${currentBookedDate} vs ${date})`)
      } else {
        currentBookedDate = date
        const time = await checkAvailableTime(sessionHeaders, date)

        log(`earlier date available at ${date} ${time}`)
        process.exit(0)
      }

      await sleep(60)
    }

  } catch(err) {
    console.error(err)
    log("Trying again")

    main(currentBookedDate)
  }
}

async function login() {
  log(`Logging in`)

  const anonymousHeaders = await fetch(`${BASE_URI}/users/sign_in`)
    .then(response => extractHeaders(response))

  return fetch(`${BASE_URI}/users/sign_in`, {
    "headers": Object.assign({}, anonymousHeaders, {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    }),
    "method": "POST",
    "body": new URLSearchParams({
      'utf8': '✓',
      'user[email]': USERNAME,
      'user[password]': PASSWORD,
      'policy_confirmed': '1',
      'commit': 'Acessar'
    }),
  })
    .then(res => (
      Object.assign({}, anonymousHeaders, {
        'Cookie': extractRelevantCookies(res)
      })
    ))
}

function checkAvailableDate(headers) {
  return fetch(`${BASE_URI}/schedule/${SCHEDULE_ID}/appointment/days/${FACILITY_ID}.json?appointments[expedite]=false`, {
    "headers": Object.assign({}, headers, {
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    }),
    "cache": "no-store"
  })
    .then(r => r.json())
    .then(r => handleErrors(r))
    .then(d => d.length > 0 ? d[0]['date'] : null)

}

function checkAvailableTime(headers, date) {
  return fetch(`${BASE_URI}/schedule/${SCHEDULE_ID}/appointment/times/${FACILITY_ID}.json?date=${date}&appointments[expedite]=false`, {
    "headers": Object.assign({}, headers, {
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    }),
    "cache": "no-store",
  })
    .then(r => r.json())
    .then(r => handleErrors(r))
    .then(d => d['business_times'][0] || d['available_times'][0])
}

function handleErrors(response) {
  const errorMessage = response['error']

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return response
}

async function extractHeaders(res) {
  const cookies = extractRelevantCookies(res)

  const html = await res.text()
  const $ = cheerio.load(html);
  const csrfToken = $('meta[name="csrf-token"]').attr('content')

  return {
    "Cookie": cookies,
    "X-CSRF-Token": csrfToken,
    "Referer": BASE_URI,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive'
  }
}

function extractRelevantCookies(res) {
  const parsedCookies = parseCookies(res.headers.get('set-cookie'))
  return `_yatri_session=${parsedCookies['_yatri_session']}`
}

function parseCookies(cookies) {
  const parsedCookies = {}

  cookies.split(';').map(c => c.trim()).forEach(c => {
    const [name, value] = c.split('=', 2)
    parsedCookies[name] = value
  })

  return parsedCookies
}

function sleep(s) {
  return new Promise((resolve) => {
    setTimeout(resolve, s * 1000);
  });
}

function log(message) {
  console.log(`[${new Date().toISOString()}]`, message)
}

const args = process.argv.slice(2);
const currentBookedDate = args[0]
main(currentBookedDate)
