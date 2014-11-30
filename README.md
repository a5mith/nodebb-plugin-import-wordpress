nodebb-plugin-import-wordpress
========================

a Wordpress 4.0 forum exporter to be required by [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import).

### What is this?

It's __just__ an exporter of [Wordpress 4.0](http://www.wordpress.org/),  that provides an API that [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import)
can use to exporter source forum data and import it to NodeBB's database. So, it's not really a conventional nodebb-plugin.

### Why is it even a NodeBB plugin?

it doesn't really need to be, nor that you can use it within NodeBB it self, but, having this as a plugin have few benefits:
* a nodebb- namespace, since you can't really use it for anything else
* it can easily `require` NodeBB useful tools, currently


### [gallery] Shortcode note

Since wordpress uses a `[gallery]` shortcode, this exporter, by default, will automatically replace the shortcodes with HTML

For example, this
```
[gallery type="rectangular" ids="123,987,002" order="rand"]
```

will become

```html
<div class="imported-wp-gallery" data-content-index="123"
         data-imported-wp-gallery-type="rectangular"
         data-imported-wp-gallery-order="rand"
         data-imported-wp-gallery-ids="123,987,002"
>
    <img class="imported-wp-gallery-img" data-id="123" src="http://real.image.url.com/path/to/image/123.jpg" />
    <img class="imported-wp-gallery-img" data-id="987" src="http://real.image.url.com/path/to/image/987.jpg" />
    <img class="imported-wp-gallery-img" data-id="002" src="http://real.image.url.com/path/to/image/002.jpg" />
</div>
```
However, if you are converting HTML to Markdown via the Importer plugun and you're using Markdown plugin which strips
all HTML classes and data-attribute, you won't see the the custom classes and stuff.

if you dont like this solution, then you could

- Don't convert content from HTML to Markdown after the Import
- Disable the HTML sanitization from the Markdown plugin options
- Install this plugin, to stay safe https://github.com/akhoury/nodebb-plugin-sanitizehtml
- Allow the class attribute on DIVs and on IMG tags in the Sanitize-HTML plugin options

Then you can write whatever client-side JS to handle your gallery images however you want.

#### Don't want `[gallery]` to HTML?
if you want to keep the `[gallery]` shortcodes in the original post content, but replace the old ids `ids="123,456,789"` to urls,
i.e.:
```
[gallery type="rectangular" ids="http://real.image.url.com/path/to/image/123.jpg,http://real.image.url.com/path/to/image/987.jpg,http://real.image.url.com/path/to/image/002.jpg" order="rand"]

```
You can pass custom JSON value to the importer, in the __Exporter specific configs (JSON)__ field
```
{"galleryShortcodes": "toURLs"}
```


### Wordpress Versions tested on:
  - WP 4.0

### Markdown note

read [nodebb-plugin-import#markdown-note](https://github.com/akhoury/nodebb-plugin-import#markdown-note)

### It's an exporter, why does it have 'import' in its title

To keep the namespacing accurate, this __exporter__ is designed to export data for [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import) only, also for a 1 time use.

