import 'regenerator-runtime/runtime';
import * as vega from "vega";;
import VegaTransformDB from "vega-transform-db";
import { specRewrite } from "vega-plus"
var htmldiff = require("../dependencies/htmldiff.js")
import { view2dot } from '../dependencies/view2dot'
var hpccWasm = window["@hpcc-js/wasm"];
import { DuckDB, SqliteDB } from "../src"
import {tableFromJson, flights_vegaplus_spec, flights_vega_spec, car_duckdb_spec, cars_spec} from "./main"



var ace = require('brace');
require('brace/mode/json');
require('brace/theme/github');

var editor = ace.edit('editor');
editor.getSession().setMode('ace/mode/json');
editor.setTheme('ace/theme/github');
editor.setOption("wrap",true);
editor.setOption("scrollPastEnd", 1);


if ((document.getElementById('VegaType') as HTMLInputElement).value == "Vega"){
    editor.setValue(JSON.stringify(flights_vega_spec, null, 2));
    // editor.resize()
}
else{
    editor.setValue(JSON.stringify(flights_vegaplus_spec, null, 2));
    // editor.resize()
}


var vseditor = ace.edit(document.querySelectorAll('pre[id=editor]')[0]);
vseditor.getSession().setMode('ace/mode/json');
vseditor.setTheme('ace/theme/github');

var url_loc = window.location.origin.toString();
var db = DuckDBs()
var SQL_db = sqliteDB()



async function sqliteDB(){
  var data_url = require("../data/sql.db")
  data_url = url_loc + data_url
  const db = new SqliteDB<"Test">(data_url)
  await db.initialize();
  return db
}

async function DuckDBs(){
  var url = require("../data/flights-3m.parquet");
  url = url_loc + url
  const db = new DuckDB<"Test">(url, "flights");
  await db.initialize();
  var cars_url = require("../data/cars.parquet");
  await db.create_table(url_loc+cars_url, "cars")
  return db
}

function rename(dataSpec, type) {
    for (var i = 0; i < dataSpec.length; i++) {
      var spec = dataSpec[i]
      for (const transform of spec.transform) {
        if (transform.type === "dbtransform") transform.type = type
  
      }
    }
  }

db.then(function(db){
    async function duck_db_query(query){
      const results = await db.queries(query);
      return results;
    }
    SQL_db.then(function(SQL_db){
        async function sql_query(query){
          const results = await SQL_db.queries(query);
          return results;
        }

        (VegaTransformDB as any).type('Serverless');

        async function Run_Visualization(_){

            var vp_spec = JSON.parse(editor.getValue().toString().trim())
            var sel = (document.getElementById('VegaType') as HTMLInputElement).value;
            console.log(vseditor.getValue())
            var table_name = JSON.parse(vseditor.getValue().toString().trim())["source"]
            if (sel == "Vega"){
                const newspec = specRewrite(vp_spec);
                const runtime = vega.parse(newspec);
                const view = new vega.View(runtime)
                .logLevel(vega.Info)
                .renderer("svg")
                .initialize(document.querySelector("#Visualization"));
                await view.runAsync();
                view.addDataListener(table_name, function(name, value) {
                    tableFromJson(value, 'showData');
                });
                tableFromJson(view["_runtime"]["data"][table_name]["values"]["value"], 'showData')

                var tmp = view["_runtime"]["signals"]
                for (var val of Object.keys(tmp)) {
                    view.addSignalListener(val, function(name, value) {
                        tmp[name]['value'] = value
                        signal_viewer(tmp)
                      });    
                }
                signal_viewer(tmp)
                


                view.runAfter(view => {
                    const dot = `${view2dot(view)}`
                    hpccWasm.graphviz.layout(dot, "svg", "dot").then(svg => {
                    const placeholder = document.getElementById("graph-placeholder");
                    placeholder.innerHTML = svg;
                    });
                })
            }
            else{
                if (sel == "DuckDB"){
                    (VegaTransformDB as any).QueryFunction(duck_db_query);            
                }
                else{
                    (VegaTransformDB as any).QueryFunction(sql_query);    
                }
                const newspec_vp = specRewrite(vp_spec)
                rename(newspec_vp.data, "dbtransform");
                (vega as any).transforms["dbtransform"] = VegaTransformDB;
                const runtime_vp = vega.parse(newspec_vp);
                const view_vp = new vega.View(runtime_vp)
                .logLevel(vega.Info)
                .renderer("svg")
                .initialize(document.querySelector("#Visualization"));
                view_vp.addDataListener(table_name, function(name, value) {
                    tableFromJson(value, 'showData');
                  });
                  
                await view_vp.runAsync();
                tableFromJson(view_vp["_runtime"]["data"][table_name]["values"]["value"], 'showData')

                var tmp = view_vp["_runtime"]["signals"]
                for (var val of Object.keys(tmp)) {
                    view_vp.addSignalListener(val, function(name, value) {
                        tmp[name]['value'] = value
                        signal_viewer(tmp)
                      });    
                }
                signal_viewer(tmp)

                view_vp.runAfter(view => {
                    const dot = `${view2dot(view)}`
                    hpccWasm.graphviz.layout(dot, "svg", "dot").then(svg => {
                    const placeholder = document.getElementById("graph-placeholder");
                    placeholder.innerHTML = svg;
                    });
                })
            }
            
        }

        function signal_viewer(signal){
              var signal_data = []
              for (var val of Object.keys(signal)) {
                  if(signal[val]['value']){
                      if(typeof(signal[val]['value'])=='object'){
                          signal_data.push({"Signal": val, "Value": JSON.stringify(signal[val]['value'])})
                      }
                      else{
                          signal_data.push({"Signal": val, "Value": signal[val]['value'].toString()})
                      }
                  }
                  else{
                      signal_data.push({"Signal": val, "Value": "null"})
                  }
              }
              tableFromJson(signal_data, 'signalData')

        }

        function examples(_, spec:any, name:any, valueToSelect:any){
            let element = document.getElementById("VegaType") as HTMLInputElement;
            vseditor.setValue('{"source":"' + name + '"}')
            element.value = valueToSelect;
            editor.setValue(JSON.stringify(spec, null, 2));
            Run_Visualization(null)
        }

        Run_Visualization(null)
        document.getElementById('run').addEventListener('click', Run_Visualization);
        document.getElementById('CarsDuckDB').addEventListener('click', event => {examples(event, car_duckdb_spec, "cars", "DuckDB")});
        document.getElementById('CarsSQL').addEventListener('click', event => {examples(event, car_duckdb_spec, "cars", "SQLite")});
        document.getElementById('FlightsDuckDB').addEventListener('click', event => {examples(event, flights_vegaplus_spec, "table", "DuckDB")});
        document.getElementById('FlightsSQL').addEventListener('click', event => {examples(event, flights_vegaplus_spec, "table", "SQLite")});
        document.getElementById('CarsVega').addEventListener('click', event => {examples(event, cars_spec, "cars", "Vega")});


    });
});