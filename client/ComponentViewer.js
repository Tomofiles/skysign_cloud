let count = 0;

function displayMessage(message) {
    count++;
    $("#message_container").append('<div class="message message' + count + '" style="display: none;">' + message + '</div>');
    $(function(){
        var lCount = count
        $(".message" + lCount + ":not(:animated)").fadeIn("slow",function(){
            $(this).delay(2000).fadeOut("slow", function() {
                $(".message" + lCount).remove();
            });
        });
    });
}
