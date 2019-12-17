import { Dropbox } from "dropbox"
import Cookie from "js-cookie"
import Automerge from "automerge"

const DBX_TOKEN_COOKIE_NAME = "dropboxToken"

function getDropboxClient() {
  const accessToken: string | null = Cookie.get(DBX_TOKEN_COOKIE_NAME)
  if (!accessToken) {
    const urlParams = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = urlParams.get("access_token")
    if (accessToken) {
      Cookie.set(DBX_TOKEN_COOKIE_NAME, accessToken)
      urlParams.delete("access_token")
      window.location.hash = ""
    } else {
      const dbx = new Dropbox({ clientId: "jfocqnmsyn28ndj", fetch })
      window.location.href = dbx.getAuthenticationUrl("http://localhost:1234/")
    }
  }
  return new Dropbox({ accessToken, fetch })
}

function sleep(n) {
  return new Promise(res => setTimeout(res, n))
}

function readBlob(blob: Blob) {
  const r = new FileReader()
  const p = new Promise<string>(res =>
    r.addEventListener("loadend", e => res(r.result as string)),
  )
  r.readAsText(blob)
  return p
}

type State = { stamps: number[] }

type PromiseReturnType<T> = T extends Promise<infer U> ? U : never
;(async function() {
  const dbx = getDropboxClient()
  var file:
    | PromiseReturnType<ReturnType<Dropbox["filesDownload"]>>
    | undefined = undefined
  try {
    file = await dbx.filesDownload({ path: "/startpage.spdata" })
  } catch (e) {
    console.log(e)
    if (e.status !== 409) throw e
  }
  const data1 = file
    ? Automerge.load<State>(await readBlob((file as any).fileBlob))
    : Automerge.from<State>({ stamps: [] })

  var dataOut = Automerge.change(data1, x =>
    x.stamps.push(new Date().getTime()),
  )

  var version = null
  while (true) {
    try {
      await dbx.filesUpload({
        contents: Automerge.save(dataOut),
        path: "/startpage.spdata",
        mode: file ? { ".tag": "update", update: file.rev } : { ".tag": "add" },
      })
      break
    } catch (e) {
      if (
        !(
          e.error?.error?.[".tag"] === "path" &&
          e.error?.error?.reason?.[".tag"] === "conflict" &&
          e.error?.error?.reason?.conflict?.[".tag"] === "file"
        )
      ) {
        console.error(e)
        throw e
      }
      console.log(e)
      file = await dbx.filesDownload({ path: "/startpage.spdata" })
      const data = await readBlob((file as any).fileBlob)
      const serverLoaded = Automerge.load<State>(data)
      console.log(data)
      console.log(dataOut.stamps, serverLoaded.stamps)
      dataOut = Automerge.merge<State>(dataOut, serverLoaded)
      console.log(dataOut.stamps)
      await sleep(1000)
    }
  }
  console.log(dataOut)
})()
