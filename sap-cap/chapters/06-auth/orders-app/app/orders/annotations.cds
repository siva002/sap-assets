using OrderService from '../../srv/order-service';

// ── Orders: List Report ────────────────────────────────────────────────────────

annotate OrderService.Orders with @(
  UI.HeaderInfo: {
    TypeName       : 'Order',
    TypeNamePlural : 'Orders',
    Title          : { Value: orderNumber },
    Description    : { Value: buyer.name }
  },

  UI.LineItem: [
    { $Type: 'UI.DataField',              Value: orderNumber,                                  Label: 'Order No.'  },
    { $Type: 'UI.DataField',              Value: buyer_ID,                                     Label: 'Customer'   },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Status',                      Label: 'Status'     },
    { $Type: 'UI.DataField',              Value: totalAmount,                                  Label: 'Amount'     },
    { $Type: 'UI.DataField',              Value: currency,                                     Label: 'Currency'   },
    { $Type: 'UI.DataField',              Value: salesRep,                                     Label: 'Sales Rep'  },
    { $Type: 'UI.DataField',              Value: createdAt,                                    Label: 'Created On' }
  ],

  UI.SelectionFields: [ status, salesRep, buyer_ID ],

  UI.DataPoint #Status: {
    Value       : status,
    Criticality : statusCriticality
  },

  // ── Object Page ─────────────────────────────────────────────────────────────

  UI.Facets: [
    {
      $Type  : 'UI.CollectionFacet',
      Label  : 'Overview',
      ID     : 'Overview',
      Facets : [
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Details', Label: 'Order Details' },
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Amounts', Label: 'Amounts'       }
      ]
    },
    {
      $Type  : 'UI.ReferenceFacet',
      Label  : 'Items',
      Target : 'items/@UI.LineItem'
    }
  ],

  UI.FieldGroup #Details: {
    Data: [
      { $Type: 'UI.DataField',              Value: orderNumber                              },
      { $Type: 'UI.DataField',              Value: buyer_ID,     Label: 'Customer'          },
      { $Type: 'UI.DataField',              Value: salesRep                                 },
      { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Status', Label: 'Status'},
      { $Type: 'UI.DataField',              Value: notes                                    },
      { $Type: 'UI.DataField',              Value: rejectionNote                            }
    ]
  },

  UI.FieldGroup #Amounts: {
    Data: [
      { $Type: 'UI.DataField', Value: currency    },
      { $Type: 'UI.DataField', Value: totalAmount }
    ]
  }
);

// Show buyer name instead of ID everywhere
annotate OrderService.Orders with {
  buyer @(
    Common.Text            : buyer.name,
    Common.TextArrangement : #TextOnly,
    Common.ValueList       : {
      CollectionPath : 'BusinessPartners',
      Parameters     : [
        { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: buyer_ID, ValueListProperty: 'ID'      },
        { $Type: 'Common.ValueListParameterDisplayOnly',                               ValueListProperty: 'name'    },
        { $Type: 'Common.ValueListParameterDisplayOnly',                               ValueListProperty: 'country' }
      ]
    }
  )
};

// ── BusinessPartners: standalone list ─────────────────────────────────────────

annotate OrderService.BusinessPartners with @(
  UI.HeaderInfo: {
    TypeName       : 'Business Partner',
    TypeNamePlural : 'Business Partners',
    Title          : { Value: name }
  },
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: name,         Label: 'Name'         },
    { $Type: 'UI.DataField', Value: country,      Label: 'Country'      },
    { $Type: 'UI.DataField', Value: city,         Label: 'City'         },
    { $Type: 'UI.DataField', Value: industry,     Label: 'Industry'     },
    { $Type: 'UI.DataField', Value: contactName,  Label: 'Contact'      },
    { $Type: 'UI.DataField', Value: contactEmail, Label: 'Email'        }
  ],
  UI.SelectionFields: [ country, industry ]
);

// ── Products: standalone list ──────────────────────────────────────────────────

annotate OrderService.Products with @(
  UI.HeaderInfo: {
    TypeName       : 'Product',
    TypeNamePlural : 'Products',
    Title          : { Value: name }
  },
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: name,        Label: 'Name'       },
    { $Type: 'UI.DataField', Value: category,    Label: 'Category'   },
    { $Type: 'UI.DataField', Value: unitPrice,   Label: 'Unit Price' },
    { $Type: 'UI.DataField', Value: currency,    Label: 'Currency'   },
    { $Type: 'UI.DataField', Value: unit,        Label: 'Unit'       },
    { $Type: 'UI.DataField', Value: description, Label: 'Description'}
  ],
  UI.SelectionFields: [ category ]
);

// ── OrderItems: inline table on Object Page ────────────────────────────────────

annotate OrderService.OrderItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: product_ID, Label: 'Product'    },
    { $Type: 'UI.DataField', Value: quantity,   Label: 'Qty'        },
    { $Type: 'UI.DataField', Value: unitPrice,  Label: 'Unit Price' },
    { $Type: 'UI.DataField', Value: netAmount,  Label: 'Net Amount' }
  ]
);

annotate OrderService.OrderItems with {
  product @(
    Common.Text            : product.name,
    Common.TextArrangement : #TextOnly,
    Common.ValueList       : {
      CollectionPath : 'Products',
      Parameters     : [
        { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: product_ID, ValueListProperty: 'ID'        },
        { $Type: 'Common.ValueListParameterDisplayOnly',                                 ValueListProperty: 'name'      },
        { $Type: 'Common.ValueListParameterDisplayOnly',                                 ValueListProperty: 'category'  },
        { $Type: 'Common.ValueListParameterDisplayOnly',                                 ValueListProperty: 'unitPrice' }
      ]
    }
  )
};
