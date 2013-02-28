/*
   monolith.js

   Provides a MonolithSeries & MonolithAggregate class that will draw 
   a Rickshaw chart y querying Elastic Search

   common options:

   - server: the elastic server server full URL
   - start_date: the id of the start date picker
   - end_date: the id of the end date picker
   - appid: the id of the app id input text
   - container: the name of the chart container
   - title: title of the series

   MonolithSeries options:

   - fields: comma-separeted list

   MonolithAggregate options:

   - field: field to aggregate on
   - aggregation interval (any of: day, week, month, year)

*/
var minute = 60000;
var colors = ["#c05020", "#30c020"];


function queryES(server, query) {
  var result;
  query = JSON.stringify(query);

  $.ajax({type: "POST",
    url: server,
    contentType: "application/json; charset=utf-8",
    dataType: "json",
    processData: false,
    data: query,
    async: false,
    success: function(json) { result = json;},
    error: function (xhr, textStatus, errorThrown) {
      console.log(textStatus);
      console.log(xhr.statusText);
    },
    failure: function(errMsg) {
      console.log("failure " + errMsg);
    }
  });
  return result;

}


function getTerms(server, field) {
  // XXX date range ?
  var query = {"query" : { "match_all" : {} },
    "facets" : {
      "facet1" : { "terms" : {"field" : field}}}};

  res = queryES(server, query);
  terms = [];
  $.each(res.facets.facet1.terms, function(i, item) {
    terms.push(item.term);
  })
  return terms;
}



$.Class.extend("MonolithBase", {},
    {
      init: function(id, server, start_date, end_date, appid, container, title) {
        this.type = 'bar';
        this._init_datepicker(start_date);
        this._init_datepicker(end_date);
        this.appid = appid;
        this.start_date = start_date;
        this.end_date = end_date;
        this.server = server;
        this.container = container;
        this.title = title;
        this.info = this._getInfo();
        this.es_server = this.server + this.info.es_endpoint;
        this.series = [];
        this.yAxis = [];
        this._fields = [];
        this.id = id;
      },

_init_datepicker: function(selector) {
  // init the date pickers
  $(selector).datepicker();
  $(selector).datepicker().on('changeDate',
      function(ev) {$(selector).datepicker('hide')});
},

  draw: function () {
    // picking the dates
    var start_date = $(this.start_date).data('datepicker').date;
    var end_date = $(this.end_date).data('datepicker').date;
    var start_date_str = start_date.toISOString().split("T")[0];
    var end_date_str = end_date.toISOString().split("T")[0];
    this._drawRange($(this.appid).val(), start_date, end_date,
        start_date_str, end_date_str);
  },
  _getInfo: function() {
    var info;
    $.ajax({url: this.server,
      type: 'GET',
      async: false,
      dataType: "json",
      success: function(result) { info = result; },
      error: function (xhr, textStatus, errorThrown) {
        console.log(xhr.responseText);
      },
      failure: function(errMsg) {
        console.log("failure " + errMsg);
      }
    });
    return info;
  },

  _async: function (query) {
    var _asyncr = this._async_receive;
    var _chart = this.chart;
    var _fields = this._fields;

    $.ajax({
      type: "POST",
      url: this.es_server,
      contentType: "application/json; charset=utf-8",
      processData: false,
      dataType: "json",
      data: query,
      success: function (json) {_asyncr(json, _chart, _fields)},
      error: function (xhr, textStatus, errorThrown) {
        alert(xhr.responseText);
      },
      failure: function(errMsg) {
        alert(errMsg);
      }
    });

  },

  _getChart: function () {
    // building the graph instance
    var chart = new Rickshaw.Graph ({
      element: document.getElementById(this.container),
        renderer: this.type,
        series: this.series,
    });

    // legend
    var legend = new Rickshaw.Graph.Legend( {
      graph: chart,
        element: document.getElementById('legend-' + this.id)

    } );

    // hover window
    var hoverDetail = new Rickshaw.Graph.HoverDetail( {
      graph: chart,
        formatter: function(series, x, y) {
          var date = series.data[x]['date'];
          var date = '<span class="date">' + date.toUTCString() + '</span>';
          var swatch = '<span class="detail_swatch" style="background-color: ' 
                       + series.color + '"></span>';
          var content = swatch + parseInt(y) + '<br>' + date;
          return content;
        }
    } );

    // legend 
    var y_ticks = new Rickshaw.Graph.Axis.Y( {
      graph: chart,
        orientation: 'left',
        tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
        element: document.getElementById('y_axis-' + this.id ),
    } );

    // DOES NOT WORK XXXX
   /*
    container =  $('#' + this.container);

    $(window).resize(function() {
      var svg = container.find('svg')[0];
      console.log(svg);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('viewBox', '0 0 ' + container.width() + ' ' + 
        container.height());
      chart.update();
    });
    */

    return chart;
  }
}
);

// Monolith series - plain series, up to 2
MonolithBase.extend("MonolithSeries",
    {},
    {
      init: function(id, server, start_date, end_date, appid, container, title, fields) {
        this._super(id, server, start_date, end_date, appid, container, title);
        this.type = 'line';

        // building the series and the y axis
        this._fields = fields.split(",");

        if (this._fields.length > 2) {
          throw new Error("We support 1 or 2 series per chart, no more.");
        }

        for (var i = 0; i < this._fields.length; i++) {
          this.series.push({name: this._fields[i],
                            data:  [{x: 0, y:0}],
                            color: colors[i]});

          }
        this.chart = this._getChart();
      },

      _drawRange: function(app_id, start_date, end_date, start_date_str,
                      end_date_str) {
          var delta = end_date.getTime() - start_date.getTime();
          var one_day = 1000 * 60 * 60 * 24;
          delta = Math.round(delta / one_day);
          //this.chart.showLoading();
          var i, x, y;
          //var match = {"field": {"add_on": app_id}};
          var match = {'match_all': {}};


          var query = {"query": match,
            "filter": {"range": {"date": {"gte": start_date_str, "lte": end_date_str}}},
            "sort": [{"date": {"order" : "asc"}}],
            "size": delta };

          query = JSON.stringify(query);
          this._async(query);
          //this.chart.hideLoading();
        },

        _async_receive: function(json, chart, fields) {
          var series = chart.series;
          var dataSeries = [];
          var name;
          var num = fields.length;

          for (var i = 0; i < num; i++) {
            dataSeries[i] = [];
          }

          var x = 0;


          $.each(json.hits.hits, function(i, item) {
            for (var i = 0; i < num; i++) {
              name = fields[i];
              if (item._source.hasOwnProperty(name)) {
                dataSeries[i].push(
                 {x: x,
                  date: Date.parse(item._source.date),
                  y: item._source[name]});
              }
            }
             x = x + 1;
          });

          for (var i = 0; i < num; i++) {
            var data = dataSeries[i];
            if (data.length == 0) { 
              series[i].data = [{x:0, y:0, date: new Date(0)}];
            }
            else {
              series[i].data = data;
            }
          }
        
          chart.render();
        }
    }
)


// Monolith series - facet search
MonolithBase.extend("MonolithAggregate",
    {},
    {
      init: function(id, server, start_date, end_date, appid, container, title, field, interval) {
        this._super(id, server, start_date, end_date, appid, container, title);
        this.type = 'line';
        this.interval = interval;
        this.field = field;
        this.series = [{color: colors[0], name: field, data: [{x: 0, y: 0 }]}];
        this.chart = this._getChart();
   },

  _drawRange: function(app_id, start_date, end_date, start_date_str,
              end_date_str) {
      var delta = end_date.getTime() - start_date.getTime();
      var one_day = 1000 * 60 * 60 * 24;
      delta = Math.round(delta / one_day);
      //this.chart.showLoading();
      var i, x, y;
      //var match = {"field": {"add_on": app_id}};
      var match = {'match_all': {}};

      var query = {"query": match,
        "facets": {
          "facet_histo" : {"date_histogram" : {
            "key_field" : "date",
            "value_field": this.field,
            "interval": this.interval},
          "facet_filter": {
            "range":
            {"date": {"gte": start_date_str, 
                        "lte": end_date_str}
            }
          }
          }
        },
        "sort": [{"date": {"order" : "asc"}}],
        "size": delta
      };
      query = JSON.stringify(query);
      this._async(query);
      //this.chart.hideLoading();
    },

    _async_receive: function(json, chart, fields) {
      var name;
      var data = [];
      var series = chart.series;
      var x = 0;

      // XXX display the day, week or month in the label...
      $.each(json.facets.facet_histo.entries, function(i, item) {

        //new Date(item.time)
        var line = {x: x, y: item.total, date: new Date(item.time)};
        data.push(line);
        x += 1;
      });
      series[0].data = data;
      chart.render();
    },
    }
)

