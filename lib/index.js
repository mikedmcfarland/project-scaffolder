const Metalsmith = require('metalsmith')
const prompt = require('cli-prompt')
const templates = require('metalsmith-templates')
const Promise = require('promise')
const _ = require('lodash')
const yaml = require('js-yaml')
const debug = require('debug')('project-scaffolder')

//Some useful promise oriented functions
const fs = require('fs')
const readFile = Promise.denodeify(fs.readFile)
const readDir = Promise.denodeify(fs.readdir)
const exec = Promise.denodeify(require('child_process').exec)
const getConfig = _.memoize( typeDir =>{
  return readFile(typeDir + '/config.yml')
    .then(yaml.safeLoad)
})

const templateDir = __dirname + '/../templates/'

doInitPrompts()
  .then(doMetalsmtih)
  .then(runCommandsInSeq)
  .done(console.log,console.err)

function doInitPrompts(){
  return getTemplateTypes().then(types => {
    return doPrompts([
      {
        key : 'destination',
        default : process.cwd()
      },
      {
        key : 'type',
        label : `project template type [${types}]`,
        default : _.first(types)
      }
    ])
  })
}

function doMetalsmtih(options){
  debug('running metal smith with options',options)
  return new Promise((fulfill,reject) => {
    const typeDir = templateDir + options.type
    Metalsmith(typeDir)
      .destination(options.destination)
      .clean(false)
      .use(prepareMetadata(typeDir))
      .use(templates({
        engine: 'swig',
        inPlace : true
      }))
      .build(err => {
        if(err) {
        console.log('build',err)
          reject(err)
        }
        fulfill(typeDir)
      })
  })
}

function getTemplateTypes(){
  return readDir(templateDir).then(d => {
    if(d.length === 0)
      throw new Error('Must be at least one template in the templates directory')

    return d
  })
}

function runCommandsInSeq(typeDir){
  return getConfig(typeDir).then(config =>{
    const cmds = config.cmds
    if(!cmds)
      return "No commands to execute"

    const allRun = cmds.reduce(
      (a,b) => a.then(vA => exec(b).then(vB => vA + '\n' + vB)),
      Promise.resolve("Executing commands"))

    return allRun
  })
}

function doPrompts(prompts){
  return new Promise((fulfill,reject)=>{
    prompts.map(p => _.isString(p) ? {key:p} : p)
    prompt.multi(prompts,fulfill)
  })
}

function prepareMetadata(typeDir){
  return (files,metalsmith,done) => {
    const assignTypeMeta = getConfig(typeDir)
      .then(config => {
        const configured = config.metadata | {}
        const prompted = config.prompts ?
          doPrompts(config.prompts) : Promise.resolve({})

        return prompted.then(p => _.assign(
          metalsmith.metadata(),
          p,
          configured))
      })

    assignTypeMeta.done(()=>done(),()=>done())
  }
}